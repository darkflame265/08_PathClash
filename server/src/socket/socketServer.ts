import { Server, Socket } from 'socket.io';
import { GameRoom } from '../game/GameRoom';
import { RoomStore } from '../store/RoomStore';
import { CoopRoom } from '../game/coop/CoopRoom';
import { CoopRoomStore } from '../store/CoopRoomStore';
import { TwoVsTwoRoom } from '../game/twovtwo/TwoVsTwoRoom';
import { TwoVsTwoRoomStore } from '../store/TwoVsTwoRoomStore';
import { PieceSkin, Position } from '../types/game.types';
import {
  AuthPayload,
  finalizeGoogleUpgrade,
  getUserFromToken,
  recordMatchmakingResult,
  resolveAccount,
  resolvePlayerProfile,
} from '../services/playerAuth';

export function initSocketServer(io: Server): void {
  const store = RoomStore.getInstance();
  const coopStore = CoopRoomStore.getInstance();
  const twoVsTwoStore = TwoVsTwoRoomStore.getInstance();
  const activeUserSockets = new Map<string, string>();
  const socketUsers = new Map<string, string>();
  const authCacheTtlMs = 10 * 60 * 1000;
  const roomSweepIntervalMs = 60 * 1000;

  const unregisterSocketSession = (socketId: string) => {
    const userId = socketUsers.get(socketId);
    if (!userId) return;
    socketUsers.delete(socketId);
    if (activeUserSockets.get(userId) === socketId) {
      activeUserSockets.delete(userId);
    }
  };

  setInterval(() => {
    const activeSocketIds = new Set(io.sockets.sockets.keys());
    store.sweep(activeSocketIds);
    coopStore.sweep(activeSocketIds);
    twoVsTwoStore.sweep(activeSocketIds);
  }, roomSweepIntervalMs);

  const tryStartTwoVsTwoTeamMatch = () => {
    const match = twoVsTwoStore.dequeueTeamMatch();
    if (!match) return;
    const [teamA, teamB] = match;
    const roomId = twoVsTwoStore.generateRoomId();
    const room = new TwoVsTwoRoom(roomId, roomId, io);
    twoVsTwoStore.add(room);

    const slots: Array<'red_top' | 'red_bottom' | 'blue_top' | 'blue_bottom'> = [
      'red_top',
      'red_bottom',
      'blue_top',
      'blue_bottom',
    ];
    const orderedMembers = [...teamA.members, ...teamB.members].sort((a, b) =>
      a.socketId.localeCompare(b.socketId),
    );

    for (let index = 0; index < orderedMembers.length; index++) {
      const member = orderedMembers[index];
      const memberSocket = io.sockets.sockets.get(member.socketId);
      if (!memberSocket) continue;
      const previousRoom = twoVsTwoStore.getBySocket(member.socketId);
      if (previousRoom) {
        memberSocket.leave(previousRoom.roomId);
      }
      const slot = room.addPlayer(
        memberSocket,
        member.nickname,
        member.userId,
        member.stats,
        member.pieceSkin,
      );
      if (!slot) continue;
      twoVsTwoStore.registerSocket(member.socketId, roomId);
      memberSocket.emit('twovtwo_room_joined', {
        roomId,
        slot,
        team: slot.startsWith('red') ? 'red' : 'blue',
      });
    }

    room.prepareGameStart();
  };

  const registerSocketSession = async (
    socket: Socket,
    auth?: AuthPayload,
    options?: { forceRevalidate?: boolean },
  ): Promise<string | null> => {
    const accessToken = auth?.accessToken?.trim();
    const cachedUserId =
      typeof socket.data.userId === 'string' ? socket.data.userId : null;
    const cachedAccessToken =
      typeof socket.data.accessToken === 'string' ? socket.data.accessToken : null;
    const cachedVerifiedAt =
      typeof socket.data.authVerifiedAt === 'number' ? socket.data.authVerifiedAt : 0;
    const cacheIsFresh = Date.now() - cachedVerifiedAt < authCacheTtlMs;
    const shouldReuseCachedSession =
      !options?.forceRevalidate &&
      cachedUserId &&
      cachedAccessToken &&
      accessToken &&
      cachedAccessToken === accessToken &&
      cacheIsFresh;

    if (shouldReuseCachedSession) {
      activeUserSockets.set(cachedUserId, socket.id);
      socketUsers.set(socket.id, cachedUserId);
      return cachedUserId;
    }

    const user = await getUserFromToken(auth?.accessToken);
    if (!user) {
      unregisterSocketSession(socket.id);
      socket.data.userId = undefined;
      socket.data.accessToken = undefined;
      socket.data.authVerifiedAt = undefined;
      return null;
    }

    const previousMappedUserId = socketUsers.get(socket.id);
    if (
      previousMappedUserId &&
      previousMappedUserId !== user.id &&
      activeUserSockets.get(previousMappedUserId) === socket.id
    ) {
      activeUserSockets.delete(previousMappedUserId);
    }

    const previousSocketId = activeUserSockets.get(user.id);
    activeUserSockets.set(user.id, socket.id);
    socketUsers.set(socket.id, user.id);
    socket.data.userId = user.id;
    socket.data.accessToken = accessToken;
    socket.data.authVerifiedAt = Date.now();

    if (previousSocketId && previousSocketId !== socket.id) {
      const previousSocket = io.sockets.sockets.get(previousSocketId);
      if (previousSocket) {
        previousSocket.emit('session_replaced', {});
        previousSocket.disconnect(true);
      }
    }

    return user.id;
  };

  io.on('connection', (socket: Socket) => {
    console.log(`[+] Connected: ${socket.id}`);

    socket.on(
      'sync_time',
      (ack?: (response: { serverNow: number }) => void) => {
        ack?.({ serverNow: Date.now() });
      },
    );

    socket.on(
      'session_register',
      async (
        { auth }: { auth?: AuthPayload },
        ack?: (response: { ok: boolean }) => void,
      ) => {
        const userId = await registerSocketSession(socket, auth);
        ack?.({ ok: Boolean(userId) });
      },
    );

    socket.on('create_room', async ({ nickname, auth, pieceSkin }: { nickname: string; auth?: AuthPayload; pieceSkin?: PieceSkin }) => {
      await registerSocketSession(socket, auth);
      const profile = await resolvePlayerProfile(auth, nickname);
      const roomId = store.generateRoomId();
      const code = store.generateCode();
      const room = new GameRoom(roomId, code, io, 'friend');
      const color = room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic');
      store.add(room);
      store.registerSocket(socket.id, roomId);
      socket.emit('room_created', { roomId, code, color, pieceSkin: pieceSkin ?? 'classic' });
    });

    socket.on(
      'join_ai',
      async (
        {
          nickname,
          auth,
          pieceSkin,
          tutorialPending,
        }: { nickname: string; auth?: AuthPayload; pieceSkin?: PieceSkin; tutorialPending?: boolean },
      ) => {
      await registerSocketSession(socket, auth);
      const profile = await resolvePlayerProfile(auth, nickname);
      const roomId = store.generateRoomId();
      const code = store.generateCode();
      const room = new GameRoom(roomId, code, io, 'ai');
      store.add(room);

      const humanColor = room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic');
      if (!humanColor) {
        socket.emit('join_error', { message: 'AI room creation failed.' });
        return;
      }

      room.addAiPlayer('PathClash AI');
      room.prepareGameStart(Boolean(tutorialPending));
      store.registerSocket(socket.id, roomId);

      const opponent = room.toClientState().players[humanColor === 'red' ? 'blue' : 'red'];
      socket.emit('room_joined', {
        roomId: room.roomId,
        color: humanColor,
        opponentNickname: opponent.nickname,
        selfPieceSkin: pieceSkin ?? 'classic',
        opponentPieceSkin: opponent.pieceSkin,
      });

      },
    );

    socket.on('join_room', async ({ code, nickname, auth, pieceSkin }: { code: string; nickname: string; auth?: AuthPayload; pieceSkin?: PieceSkin }) => {
      await registerSocketSession(socket, auth);
      const profile = await resolvePlayerProfile(auth, nickname);
      const room = store.getByCode(code.toUpperCase());
      if (!room || room.isFull) {
        socket.emit('join_error', { message: '방을 찾을 수 없거나 이미 가득 찼습니다.' });
        return;
      }

      const color = room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic');
      if (!color) {
        socket.emit('join_error', { message: '입장할 수 없습니다.' });
        return;
      }

      room.prepareGameStart();
      store.registerSocket(socket.id, room.roomId);
      const opponent = room.toClientState().players[color === 'red' ? 'blue' : 'red'];
      socket.emit('room_joined', {
        roomId: room.roomId,
        color,
        opponentNickname: opponent.nickname,
        selfPieceSkin: pieceSkin ?? 'classic',
        opponentPieceSkin: opponent.pieceSkin,
      });
      socket.to(room.roomId).emit('opponent_joined', {
        nickname: profile.nickname,
        color,
        pieceSkin: pieceSkin ?? 'classic',
      });

    });

    socket.on('join_random', async ({ nickname, auth, pieceSkin }: { nickname: string; auth?: AuthPayload; pieceSkin?: PieceSkin }) => {
      await registerSocketSession(socket, auth);
      const profile = await resolvePlayerProfile(auth, nickname);
      const queued = store.dequeueRandom();
      if (!queued || queued.socketId === socket.id) {
        if (queued) {
          store.enqueueRandom(queued.socketId, queued.nickname, queued.userId, queued.stats, queued.pieceSkin);
        }
        store.enqueueRandom(socket.id, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic');
        socket.emit('matchmaking_waiting', {});
        return;
      }

      const roomId = store.generateRoomId();
      const code = store.generateCode();
      const room = new GameRoom(roomId, code, io, 'random');
      store.add(room);

      const queuedSocket = io.sockets.sockets.get(queued.socketId);
      if (!queuedSocket) {
        store.enqueueRandom(socket.id, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic');
        socket.emit('matchmaking_waiting', {});
        return;
      }

      room.addPlayer(queuedSocket, queued.nickname, queued.userId, queued.stats, queued.pieceSkin);
      room.prepareGameStart();
      store.registerSocket(queued.socketId, roomId);
      queuedSocket.emit('room_joined', {
        roomId,
        color: 'red',
        opponentNickname: profile.nickname,
        selfPieceSkin: queued.pieceSkin,
        opponentPieceSkin: pieceSkin ?? 'classic',
      });

      room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic');
      store.registerSocket(socket.id, roomId);
      socket.emit('room_joined', {
        roomId,
        color: 'blue',
        opponentNickname: queued.nickname,
        selfPieceSkin: pieceSkin ?? 'classic',
        opponentPieceSkin: queued.pieceSkin,
      });

    });

    socket.on('cancel_random', () => {
      store.removeFromQueue(socket.id);
    });

    socket.on('join_coop', async ({ nickname, auth, pieceSkin }: { nickname: string; auth?: AuthPayload; pieceSkin?: PieceSkin }) => {
      await registerSocketSession(socket, auth);
      const profile = await resolvePlayerProfile(auth, nickname);
      const queued = coopStore.dequeue();
      if (!queued || queued.socketId === socket.id) {
        if (queued) {
          coopStore.enqueue(queued.socketId, queued.nickname, queued.userId, queued.stats, queued.pieceSkin);
        }
        coopStore.enqueue(socket.id, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic');
        socket.emit('coop_matchmaking_waiting', {});
        return;
      }

      const roomId = coopStore.generateRoomId();
      const room = new CoopRoom(roomId, roomId, io);
      coopStore.add(room);

      const queuedSocket = io.sockets.sockets.get(queued.socketId);
      if (!queuedSocket) {
        coopStore.enqueue(socket.id, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic');
        socket.emit('coop_matchmaking_waiting', {});
        return;
      }

      room.addPlayer(queuedSocket, queued.nickname, queued.userId, queued.stats, queued.pieceSkin);
      coopStore.registerSocket(queued.socketId, roomId);
      queuedSocket.emit('coop_room_joined', {
        roomId,
        color: 'red',
        teammateNickname: profile.nickname,
        selfPieceSkin: queued.pieceSkin,
        teammatePieceSkin: pieceSkin ?? 'classic',
      });

      room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic');
      coopStore.registerSocket(socket.id, roomId);
      socket.emit('coop_room_joined', {
        roomId,
        color: 'blue',
        teammateNickname: queued.nickname,
        selfPieceSkin: pieceSkin ?? 'classic',
        teammatePieceSkin: queued.pieceSkin,
      });

      room.prepareGameStart();
    });

    socket.on('cancel_coop', () => {
      coopStore.removeFromQueue(socket.id);
    });

    socket.on('account_sync', async ({ auth }: { auth?: AuthPayload }, ack?: (response: unknown) => void) => {
      await registerSocketSession(socket, auth, { forceRevalidate: true });
      ack?.(await resolveAccount(auth));
    });

    socket.on(
      'finalize_google_upgrade',
      async (
        {
          auth,
          guestAuth,
          guestProfile,
          flowStartedAt,
          allowExistingSwitch,
        }: {
          auth?: AuthPayload;
          guestAuth?: AuthPayload;
          guestProfile?: {
            nickname: string | null;
            wins: number;
            losses: number;
            tokens?: number;
            dailyRewardWins?: number;
          };
          flowStartedAt?: string;
          allowExistingSwitch?: boolean;
        },
        ack?: (response: unknown) => void,
      ) => {
        await registerSocketSession(socket, auth, { forceRevalidate: true });
        ack?.(await finalizeGoogleUpgrade(
          auth,
          guestAuth,
          guestProfile,
          flowStartedAt,
          Boolean(allowExistingSwitch),
        ));
      },
    );

    socket.on('path_update', ({ path }: { path: Position[] }) => {
      const room = store.getBySocket(socket.id);
      if (room) {
        room.updatePlannedPath(socket.id, path);
        return;
      }
      const coopRoom = coopStore.getBySocket(socket.id);
      coopRoom?.updatePlannedPath(socket.id, path);
    });

    socket.on('join_2v2', async ({ nickname, auth, pieceSkin }: { nickname: string; auth?: AuthPayload; pieceSkin?: PieceSkin }) => {
      await registerSocketSession(socket, auth);
      const profile = await resolvePlayerProfile(auth, nickname);
      twoVsTwoStore.enqueue(socket.id, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic');
      const existingRoom = twoVsTwoStore.getBySocket(socket.id);
      tryStartTwoVsTwoTeamMatch();
      if (!existingRoom && !twoVsTwoStore.getBySocket(socket.id)) {
        socket.emit('twovtwo_matchmaking_waiting', {});
      }
    });

    socket.on('cancel_2v2', () => {
      twoVsTwoStore.removeFromQueue(socket.id);
    });

    socket.on('twovtwo_client_ready', () => {
      const room = twoVsTwoStore.getBySocket(socket.id);
      room?.markClientReady(socket.id);
    });

    socket.on('twovtwo_path_update', ({ path }: { path: Position[] }) => {
      const room = twoVsTwoStore.getBySocket(socket.id);
      room?.updatePlannedPath(socket.id, path);
    });

    socket.on(
      'twovtwo_submit_path',
      (
        { path }: { path: Position[] },
        ack?: (response: { ok: boolean; acceptedPath: Position[] }) => void,
      ) => {
        const room = twoVsTwoStore.getBySocket(socket.id);
        const result = room?.submitPath(socket.id, path) ?? { ok: false, acceptedPath: [] };
        ack?.(result);
      },
    );

    socket.on('submit_path', ({ path }: { path: Position[] }, ack?: (response: { ok: boolean }) => void) => {
      const room = store.getBySocket(socket.id);
      const ok =
        room?.submitPath(socket.id, path) ??
        coopStore.getBySocket(socket.id)?.submitPath(socket.id, path) ??
        false;
      ack?.({ ok });
    });

    socket.on('request_rematch', () => {
      const twoVsTwoRoom = twoVsTwoStore.getBySocket(socket.id);
      if (twoVsTwoRoom) {
        const result = twoVsTwoRoom.requestRematch(socket.id);
        if (result.status === 'waiting_teammate' && result.teammateSocketId) {
          const teammateSocket = io.sockets.sockets.get(result.teammateSocketId);
          teammateSocket?.emit('rematch_requested', {});
        }
        if (result.status === 'team_ready') {
          twoVsTwoStore.enqueueTeam(
            result.members.map((member) => ({
              socketId: member.socketId,
              nickname: member.nickname,
              userId: member.userId,
              stats: member.stats,
              pieceSkin: member.pieceSkin,
            })),
          );
          for (const member of result.members) {
            const memberSocket = io.sockets.sockets.get(member.socketId);
            memberSocket?.emit('twovtwo_matchmaking_waiting', {});
          }
          tryStartTwoVsTwoTeamMatch();
        }
        return;
      }

      const room = store.getBySocket(socket.id);
      if (room) {
        room.requestRematch(socket.id);
        return;
      }
      const coopRoom = coopStore.getBySocket(socket.id);
      coopRoom?.requestRematch(socket.id);
    });

    socket.on('resume_tutorial', () => {
      const room = store.getBySocket(socket.id);
      room?.resumeTutorial(socket.id);
    });

    socket.on('game_client_ready', () => {
      const room = store.getBySocket(socket.id);
      room?.markClientReady(socket.id);
    });

    socket.on('coop_client_ready', () => {
      const room = coopStore.getBySocket(socket.id);
      room?.markClientReady(socket.id);
    });

    socket.on('chat_send', ({ message }: { message: string }) => {
      const room = store.getBySocket(socket.id);
      if (room) {
        room.sendChat(socket.id, message);
        return;
      }
      const coopRoom = coopStore.getBySocket(socket.id);
      if (coopRoom) {
        coopRoom.sendChat(socket.id, message);
        return;
      }
      const twoVsTwoRoom = twoVsTwoStore.getBySocket(socket.id);
      twoVsTwoRoom?.sendChat(socket.id, message);
    });

    socket.on('update_piece_skin', ({ pieceSkin }: { pieceSkin: PieceSkin }) => {
      const room = store.getBySocket(socket.id);
      if (room) {
        room.updatePlayerSkin(socket.id, pieceSkin);
        return;
      }
      const coopRoom = coopStore.getBySocket(socket.id);
      if (coopRoom) {
        coopRoom.updatePlayerSkin(socket.id, pieceSkin);
        return;
      }
      const twoVsTwoRoom = twoVsTwoStore.getBySocket(socket.id);
      twoVsTwoRoom?.updatePlayerSkin(socket.id, pieceSkin);
    });

    socket.on('coop_path_update', ({ path }: { path: Position[] }) => {
      const room = coopStore.getBySocket(socket.id);
      room?.updatePlannedPath(socket.id, path);
    });

    socket.on('coop_submit_path', ({ path }: { path: Position[] }, ack?: (response: { ok: boolean }) => void) => {
      const room = coopStore.getBySocket(socket.id);
      const ok = room?.submitPath(socket.id, path) ?? false;
      ack?.({ ok });
    });

    socket.on('disconnect', () => {
      console.log(`[-] Disconnected: ${socket.id}`);
      unregisterSocketSession(socket.id);
      store.removeFromQueue(socket.id);
      coopStore.removeFromQueue(socket.id);
      twoVsTwoStore.removeFromQueue(socket.id);
      const { room, disconnectResult } = store.removeSocket(socket.id);
      const coopRoom = coopStore.removeSocket(socket.id);
      const twoVsTwoRoom = twoVsTwoStore.removeSocket(socket.id);

      if (
        room &&
        disconnectResult.shouldAwardDisconnectResult &&
        disconnectResult.winnerColor
      ) {
        const winner = room.getPlayerByColor(disconnectResult.winnerColor);
        void recordMatchmakingResult(
          winner?.userId ?? null,
          socket.data.userId ?? null,
        );
      }

      if (room && room.playerCount > 0) {
        io.to(room.roomId).emit('opponent_disconnected', {});
      }

      if (coopRoom && coopRoom.playerCount > 0) {
        io.to(coopRoom.roomId).emit('coop_game_over', {
          result: 'lose',
          message: 'Ally disconnected.',
        });
      }

    });
  });
}
