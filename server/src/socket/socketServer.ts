import { Server, Socket } from 'socket.io';
import { GameRoom } from '../game/GameRoom';
import { RoomStore } from '../store/RoomStore';
import { CoopRoom } from '../game/coop/CoopRoom';
import { CoopRoomStore } from '../store/CoopRoomStore';
import { TwoVsTwoRoom } from '../game/twovtwo/TwoVsTwoRoom';
import { TwoVsTwoRoomStore } from '../store/TwoVsTwoRoomStore';
import { AbilityRoom } from '../game/ability/AbilityRoom';
import { AbilityRoomStore } from '../store/AbilityRoomStore';
import { getAndroidVersionStatus } from '../config/appVersion';
import { BoardSkin, PieceSkin, Position } from '../types/game.types';
import type { AbilitySkillId, AbilitySkillReservation } from '../game/ability/AbilityTypes';
import {
  AuthPayload,
  type AccountProfile,
  finalizeGoogleUpgrade,
  grantDailyRewardTokens,
  getUserFromToken,
  recordMatchmakingResult,
  resolveAccount,
  type PersistentPlayerProfile,
  resolvePlayerProfile,
} from '../services/playerAuth';
import {
  claimAchievementReward,
  claimAllAchievementRewards,
  recordAbilitySpecialWin,
  recordDailyRewardGrant,
  recordMatchPlayed,
  recordModeWin,
  trackSettingsAchievements,
} from '../services/achievementService';

export function initSocketServer(io: Server): void {
  const store = RoomStore.getInstance();
  const coopStore = CoopRoomStore.getInstance();
  const twoVsTwoStore = TwoVsTwoRoomStore.getInstance();
  const abilityStore = AbilityRoomStore.getInstance();
  const activeUserSockets = new Map<string, string>();
  const socketUsers = new Map<string, string>();
  const authCacheTtlMs = 10 * 60 * 1000;
  const profileCacheTtlMs = 60 * 1000;
  const roomSweepIntervalMs = 60 * 1000;
  const metricsLogIntervalMs = 60 * 1000;
  const slowProfileResolveThresholdMs = 150;
  const randomFallbackMatchMs = 7_000;
  const randomFallbackTimers = new Map<
    string,
    ReturnType<typeof setTimeout>
  >();
  const profileCache = new Map<
    string,
    { expiresAt: number; profile: PersistentPlayerProfile }
  >();

  const unregisterSocketSession = (socketId: string) => {
    const userId = socketUsers.get(socketId);
    if (!userId) return;
    socketUsers.delete(socketId);
    if (activeUserSockets.get(userId) === socketId) {
      activeUserSockets.delete(userId);
    }
  };

  const getSocketOrigin = (socket: Socket) => {
    const origin = socket.handshake.headers.origin;
    return typeof origin === 'string' ? origin : '';
  };

  const isNativeLikeOrigin = (origin: string) =>
    origin === 'capacitor://localhost' ||
    origin === 'ionic://localhost' ||
    origin === 'http://localhost' ||
    origin === 'https://localhost';

  const getCurrentAppVersionCode = (auth?: AuthPayload) => {
    const parsed =
      typeof auth?.appVersionCode === 'number'
        ? auth.appVersionCode
        : Number(auth?.appVersionCode);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  };

  const getUpdateRequirement = (socket: Socket, auth?: AuthPayload) => {
    const origin = getSocketOrigin(socket);
    const isAndroidClient =
      auth?.clientPlatform === 'android' || isNativeLikeOrigin(origin);

    if (!isAndroidClient) return null;

    return getAndroidVersionStatus(getCurrentAppVersionCode(auth));
  };

  const emitUpdateRequired = (socket: Socket, auth?: AuthPayload) => {
    const requirement = getUpdateRequirement(socket, auth);
    if (!requirement?.forceUpdate) return null;

    socket.emit('update_required', requirement);
    socket.emit('join_error', {
      message:
        'A new version is available. Please update the app from the Play Store.',
    });
    return requirement;
  };

  const clearExpiredProfileCache = (now = Date.now()) => {
    for (const [userId, entry] of profileCache.entries()) {
      if (entry.expiresAt <= now) {
        profileCache.delete(userId);
      }
    }
  };

  const clearRandomFallback = (socketId: string) => {
    const timer = randomFallbackTimers.get(socketId);
    if (timer) {
      clearTimeout(timer);
      randomFallbackTimers.delete(socketId);
    }
  };

  const fakeRandomNicknames = [
    'Minho',
    'Jisoo',
    'Haru',
    'Noah',
    'Sora',
    'Yuna',
    'Luca',
    'Mina',
    'Kai',
    'Rin',
    'Daeho',
    'Aria',
  ] as const;

  const fakeRandomSkins: PieceSkin[] = [
    'classic',
    'ember',
    'nova',
    'aurora',
    'void',
    'plasma',
  ];

  const createDisguisedRandomProfile = (
    profile: PersistentPlayerProfile,
  ): {
    nickname: string;
    userId: string;
    stats: { wins: number; losses: number };
    pieceSkin: PieceSkin;
    boardSkin: BoardSkin;
  } => {
    const nickname =
      fakeRandomNicknames[
        Math.floor(Math.random() * fakeRandomNicknames.length)
      ];
    const fakeId = `usr_${Math.random().toString(36).slice(2, 10)}${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const winsBase = Math.max(
      0,
      profile.stats.wins + Math.floor(Math.random() * 101) - 50,
    );
    const lossesBase = Math.max(
      0,
      profile.stats.losses + Math.floor(Math.random() * 101) - 50,
    );
    const pieceSkin =
      fakeRandomSkins[Math.floor(Math.random() * fakeRandomSkins.length)] ??
      'classic';
    return {
      nickname,
      userId: fakeId,
      stats: { wins: winsBase, losses: lossesBase },
      pieceSkin,
      boardSkin: 'classic',
    };
  };

  const createRandomFallbackMatch = async ({
    socket,
    profile,
    pieceSkin,
    boardSkin,
  }: {
    socket: Socket;
    profile: PersistentPlayerProfile;
    pieceSkin: PieceSkin;
    boardSkin: BoardSkin;
  }) => {
    clearRandomFallback(socket.id);
    if (!io.sockets.sockets.has(socket.id)) return;
    if (!store.isQueuedRandom(socket.id)) return;

    store.removeFromQueue(socket.id);

    const roomId = store.generateRoomId();
    const code = store.generateCode();
    const room = new GameRoom(roomId, code, io, 'random');
    store.add(room);

    const humanColor = room.addPlayer(
      socket,
      profile.nickname,
      profile.userId,
      profile.stats,
      pieceSkin,
      boardSkin,
    );
    if (!humanColor) return;

    const fakeProfile = createDisguisedRandomProfile(profile);
    room.addAiPlayer(fakeProfile.nickname, {
      userId: fakeProfile.userId,
      stats: fakeProfile.stats,
      pieceSkin: fakeProfile.pieceSkin,
      boardSkin: fakeProfile.boardSkin,
    });
    store.registerSocket(socket.id, roomId);

    const opponentColor = humanColor === 'red' ? 'blue' : 'red';
    const opponent = room.toClientState().players[opponentColor];
    socket.emit('room_joined', {
      roomId,
      color: humanColor,
      opponentNickname: opponent.nickname,
      selfPieceSkin: pieceSkin,
      opponentPieceSkin: opponent.pieceSkin,
    });
    room.startGame();
  };

  const scheduleRandomFallback = ({
    socket,
    profile,
    pieceSkin,
    boardSkin,
  }: {
    socket: Socket;
    profile: PersistentPlayerProfile;
    pieceSkin: PieceSkin;
    boardSkin: BoardSkin;
  }) => {
    clearRandomFallback(socket.id);
    randomFallbackTimers.set(
      socket.id,
      setTimeout(() => {
        void createRandomFallbackMatch({
          socket,
          profile,
          pieceSkin,
          boardSkin,
        });
      }, randomFallbackMatchMs),
    );
  };

  const notifyRoomClosed = ({
    socketIds,
    reason,
  }: {
    socketIds: string[];
    reason: 'turn_limit' | 'waiting_timeout' | 'empty';
  }) => {
    if (reason !== 'turn_limit') return;
    for (const socketId of socketIds) {
      if (!io.sockets.sockets.has(socketId)) continue;
      io.to(socketId).emit('room_closed', {
        reason,
      });
    }
  };

  const resolvePlayerProfileCached = async (
    socket: Socket,
    auth: AuthPayload | undefined,
    fallbackNickname: string,
  ): Promise<PersistentPlayerProfile> => {
    const userId =
      typeof socket.data.userId === 'string' ? socket.data.userId : null;

    if (userId) {
      const cached = profileCache.get(userId);
      if (cached && cached.expiresAt > Date.now()) {
        return cached.profile;
      }
    }

    const startedAt = Date.now();
    const profile = await resolvePlayerProfile(auth, fallbackNickname);
    const durationMs = Date.now() - startedAt;

    if (durationMs >= slowProfileResolveThresholdMs) {
      console.log(
        `[perf] resolvePlayerProfile took ${durationMs}ms userId=${profile.userId ?? 'guest'} socket=${socket.id}`,
      );
    }

    if (profile.userId) {
      profileCache.set(profile.userId, {
        expiresAt: Date.now() + profileCacheTtlMs,
        profile,
      });
    }

    return profile;
  };

  setInterval(() => {
    const activeSocketIds = new Set(io.sockets.sockets.keys());
    store.sweep(activeSocketIds, Date.now(), notifyRoomClosed);
    coopStore.sweep(activeSocketIds, Date.now(), notifyRoomClosed);
    twoVsTwoStore.sweep(activeSocketIds, Date.now(), notifyRoomClosed);
    abilityStore.sweep(activeSocketIds, Date.now(), notifyRoomClosed);
  }, roomSweepIntervalMs);

  setInterval(() => {
    clearExpiredProfileCache();
    const duelStats = store.getStats();
    const coopStats = coopStore.getStats();
    const twoVsTwoStats = twoVsTwoStore.getStats();
    const abilityStats = abilityStore.getStats();
    const hasActiveTraffic =
      io.sockets.sockets.size > 0 ||
      activeUserSockets.size > 0 ||
      profileCache.size > 0 ||
      duelStats.roomCount > 0 ||
      duelStats.queueLength > 0 ||
      duelStats.socketMappings > 0 ||
      coopStats.roomCount > 0 ||
      coopStats.queueLength > 0 ||
      coopStats.socketMappings > 0 ||
      twoVsTwoStats.roomCount > 0 ||
      twoVsTwoStats.queueLength > 0 ||
      twoVsTwoStats.teamQueueLength > 0 ||
      twoVsTwoStats.socketMappings > 0 ||
      abilityStats.roomCount > 0 ||
      abilityStats.queueLength > 0 ||
      abilityStats.socketMappings > 0;

    if (!hasActiveTraffic) {
      return;
    }

    console.log(
      `[metrics] sockets=${io.sockets.sockets.size} activeUserSessions=${activeUserSockets.size} profileCache=${profileCache.size} ` +
        `rooms{duel=${duelStats.roomCount},coop=${coopStats.roomCount},2v2=${twoVsTwoStats.roomCount},ability=${abilityStats.roomCount}} ` +
        `queues{duel=${duelStats.queueLength},coop=${coopStats.queueLength},2v2Solo=${twoVsTwoStats.queueLength},2v2Team=${twoVsTwoStats.teamQueueLength},ability=${abilityStats.queueLength}} ` +
        `mappings{duel=${duelStats.socketMappings},coop=${coopStats.socketMappings},2v2=${twoVsTwoStats.socketMappings},ability=${abilityStats.socketMappings}}`,
    );
  }, metricsLogIntervalMs);

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
    options?: { forceRevalidate?: boolean; allowConcurrentSessions?: boolean },
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

    if (
      !options?.allowConcurrentSessions &&
      previousSocketId &&
      previousSocketId !== socket.id
    ) {
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
        ack?: (
          response:
            | { ok: boolean; updateRequired: false }
            | ({
                ok: false;
                updateRequired: true;
              } & ReturnType<typeof getAndroidVersionStatus>),
        ) => void,
      ) => {
        const requirement = getUpdateRequirement(socket, auth);
        if (requirement?.forceUpdate) {
          socket.emit('update_required', requirement);
          ack?.({
            ok: false,
            updateRequired: true,
            ...requirement,
          });
          return;
        }
        const userId = await registerSocketSession(socket, auth, {
          allowConcurrentSessions: true,
        });
        ack?.({ ok: Boolean(userId), updateRequired: false });
      },
    );

    socket.on('create_room', async ({ nickname, auth, pieceSkin, boardSkin }: { nickname: string; auth?: AuthPayload; pieceSkin?: PieceSkin; boardSkin?: BoardSkin }) => {
      if (emitUpdateRequired(socket, auth)) return;
      await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
      const profile = await resolvePlayerProfileCached(socket, auth, nickname);
      const roomId = store.generateRoomId();
      const code = store.generateCode();
      const room = new GameRoom(roomId, code, io, 'friend');
      const color = room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic', boardSkin ?? 'classic');
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
          boardSkin,
        }: { nickname: string; auth?: AuthPayload; pieceSkin?: PieceSkin; boardSkin?: BoardSkin; tutorialPending?: boolean },
      ) => {
      if (emitUpdateRequired(socket, auth)) return;
      await registerSocketSession(socket, auth);
      const profile = await resolvePlayerProfileCached(socket, auth, nickname);
      const roomId = store.generateRoomId();
      const code = store.generateCode();
      const room = new GameRoom(roomId, code, io, 'ai');
      store.add(room);

      const humanColor = room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic', boardSkin ?? 'classic');
      if (!humanColor) {
        socket.emit('join_error', { message: 'AI room creation failed.' });
        return;
      }

      room.addAiPlayer('PathClash AI');
      store.registerSocket(socket.id, roomId);

      const roomState = room.toClientState();
      const opponent = roomState.players[humanColor === 'red' ? 'blue' : 'red'];
      socket.emit('room_joined', {
        roomId: room.roomId,
        color: humanColor,
        opponentNickname: opponent.nickname,
        selfPieceSkin: pieceSkin ?? 'classic',
        opponentPieceSkin: opponent.pieceSkin,
      });
      room.startGame(Boolean(tutorialPending));

      },
    );

    socket.on('join_room', async ({ code, nickname, auth, pieceSkin, boardSkin }: { code: string; nickname: string; auth?: AuthPayload; pieceSkin?: PieceSkin; boardSkin?: BoardSkin }) => {
      if (emitUpdateRequired(socket, auth)) return;
      await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
      const profile = await resolvePlayerProfileCached(socket, auth, nickname);
      const room = store.getByCode(code.toUpperCase());
      if (!room || room.isFull) {
        socket.emit('join_error', { message: '방을 찾을 수 없거나 이미 가득 찼습니다.' });
        return;
      }

      const color = room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic', boardSkin ?? 'classic');
      if (!color) {
        socket.emit('join_error', { message: '입장할 수 없습니다.' });
        return;
      }

      store.registerSocket(socket.id, room.roomId);
      const roomState = room.toClientState();
      const opponent = roomState.players[color === 'red' ? 'blue' : 'red'];
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

      room.startGame();

    });

    socket.on(
      'create_ability_room',
      async ({
        nickname,
        auth,
        pieceSkin,
        boardSkin,
        equippedSkills,
      }: {
        nickname: string;
        auth?: AuthPayload;
        pieceSkin?: PieceSkin;
        boardSkin?: BoardSkin;
        equippedSkills: AbilitySkillId[];
      }) => {
        if (emitUpdateRequired(socket, auth)) return;
        await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
        const profile = await resolvePlayerProfileCached(socket, auth, nickname);
        const roomId = abilityStore.generateRoomId();
        const code = abilityStore.generateCode();
        const room = new AbilityRoom(roomId, code, io);
        room.enablePrivateMatch();
        const color = room.addPlayer(
          socket,
          profile.nickname,
          profile.userId,
          profile.stats,
          pieceSkin ?? 'classic',
          boardSkin ?? 'classic',
          equippedSkills,
        );
        abilityStore.add(room);
        abilityStore.registerSocket(socket.id, roomId);
        socket.emit('ability_room_created', {
          roomId,
          code,
          color,
        });
      },
    );

    socket.on(
      'join_ability_room',
      async ({
        code,
        nickname,
        auth,
        pieceSkin,
        boardSkin,
        equippedSkills,
      }: {
        code: string;
        nickname: string;
        auth?: AuthPayload;
        pieceSkin?: PieceSkin;
        boardSkin?: BoardSkin;
        equippedSkills: AbilitySkillId[];
      }) => {
        if (emitUpdateRequired(socket, auth)) return;
        await registerSocketSession(socket, auth, { allowConcurrentSessions: true });
        const profile = await resolvePlayerProfileCached(socket, auth, nickname);
        const room = abilityStore.getByCode(code);
        if (!room || room.isFull) {
          socket.emit('join_error', { message: '방을 찾을 수 없거나 이미 가득 찼습니다.' });
          return;
        }

        room.enablePrivateMatch();
        const color = room.addPlayer(
          socket,
          profile.nickname,
          profile.userId,
          profile.stats,
          pieceSkin ?? 'classic',
          boardSkin ?? 'classic',
          equippedSkills,
        );
        if (!color) {
          socket.emit('join_error', { message: '입장할 수 없습니다.' });
          return;
        }

        room.prepareGameStart();
        abilityStore.registerSocket(socket.id, room.roomId);
        socket.emit('ability_room_joined', {
          roomId: room.roomId,
          color,
          opponentNickname:
            room.toClientState(color).players[color === 'red' ? 'blue' : 'red'].nickname,
        });
        socket.to(room.roomId).emit('ability_opponent_joined', {
          nickname: profile.nickname,
          color,
        });
      },
    );

    socket.on('join_random', async ({ nickname, auth, pieceSkin, boardSkin }: { nickname: string; auth?: AuthPayload; pieceSkin?: PieceSkin; boardSkin?: BoardSkin }) => {
      if (emitUpdateRequired(socket, auth)) return;
      await registerSocketSession(socket, auth);
      const profile = await resolvePlayerProfileCached(socket, auth, nickname);
      const selectedPieceSkin = pieceSkin ?? 'classic';
      const selectedBoardSkin = boardSkin ?? 'classic';
      const queued = store.dequeueRandom();
      if (!queued || queued.socketId === socket.id) {
        if (queued) {
          store.enqueueRandom(queued.socketId, queued.nickname, queued.userId, queued.stats, queued.pieceSkin, queued.boardSkin);
        }
        store.enqueueRandom(socket.id, profile.nickname, profile.userId, profile.stats, selectedPieceSkin, selectedBoardSkin);
        socket.emit('matchmaking_waiting', {});
        scheduleRandomFallback({
          socket,
          profile,
          pieceSkin: selectedPieceSkin,
          boardSkin: selectedBoardSkin,
        });
        return;
      }

      clearRandomFallback(socket.id);
      clearRandomFallback(queued.socketId);

      const roomId = store.generateRoomId();
      const code = store.generateCode();
      const room = new GameRoom(roomId, code, io, 'random');
      store.add(room);

      const queuedSocket = io.sockets.sockets.get(queued.socketId);
      if (!queuedSocket) {
        store.enqueueRandom(socket.id, profile.nickname, profile.userId, profile.stats, selectedPieceSkin, selectedBoardSkin);
        socket.emit('matchmaking_waiting', {});
        scheduleRandomFallback({
          socket,
          profile,
          pieceSkin: selectedPieceSkin,
          boardSkin: selectedBoardSkin,
        });
        return;
      }

      room.addPlayer(queuedSocket, queued.nickname, queued.userId, queued.stats, queued.pieceSkin, queued.boardSkin);
      room.prepareGameStart();
      store.registerSocket(queued.socketId, roomId);
      queuedSocket.emit('room_joined', {
        roomId,
        color: 'red',
        opponentNickname: profile.nickname,
        selfPieceSkin: queued.pieceSkin,
        opponentPieceSkin: selectedPieceSkin,
      });

      room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, selectedPieceSkin, selectedBoardSkin);
      store.registerSocket(socket.id, roomId);
      socket.emit('room_joined', {
        roomId,
        color: 'blue',
        opponentNickname: queued.nickname,
        selfPieceSkin: selectedPieceSkin,
        opponentPieceSkin: queued.pieceSkin,
      });

    });

    socket.on('cancel_random', () => {
      clearRandomFallback(socket.id);
      store.removeFromQueue(socket.id);
    });

    socket.on('join_coop', async ({ nickname, auth, pieceSkin }: { nickname: string; auth?: AuthPayload; pieceSkin?: PieceSkin }) => {
      if (emitUpdateRequired(socket, auth)) return;
      await registerSocketSession(socket, auth);
      const profile = await resolvePlayerProfileCached(socket, auth, nickname);
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
      const requirement = getUpdateRequirement(socket, auth);
      if (requirement?.forceUpdate) {
        socket.emit('update_required', requirement);
        ack?.({ status: 'UPDATE_REQUIRED', ...requirement });
        return;
      }
      await registerSocketSession(socket, auth, { forceRevalidate: true });
      ack?.(await resolveAccount(auth));
    });

    socket.on(
      'achievements_claim',
      async (
        { auth, achievementId }: { auth?: AuthPayload; achievementId?: string },
        ack?: (response: unknown) => void,
      ) => {
        const requirement = getUpdateRequirement(socket, auth);
        if (requirement?.forceUpdate) {
          socket.emit('update_required', requirement);
          ack?.({ status: 'UPDATE_REQUIRED', ...requirement });
          return;
        }
        const userId = await registerSocketSession(socket, auth, { forceRevalidate: true });
        if (userId && achievementId) {
          await claimAchievementReward(userId, achievementId);
        }
        ack?.(await resolveAccount(auth));
      },
    );

    socket.on(
      'achievements_claim_all',
      async (
        { auth }: { auth?: AuthPayload },
        ack?: (response: unknown) => void,
      ) => {
        const requirement = getUpdateRequirement(socket, auth);
        if (requirement?.forceUpdate) {
          socket.emit('update_required', requirement);
          ack?.({ status: 'UPDATE_REQUIRED', ...requirement });
          return;
        }
        const userId = await registerSocketSession(socket, auth, { forceRevalidate: true });
        if (userId) {
          await claimAllAchievementRewards(userId);
        }
        ack?.(await resolveAccount(auth));
      },
    );

    socket.on(
      'achievements_sync_settings',
      async (
        {
          auth,
          isMusicMuted,
          isSfxMuted,
          musicVolumePercent,
          sfxVolumePercent,
        }: {
          auth?: AuthPayload;
          isMusicMuted: boolean;
          isSfxMuted: boolean;
          musicVolumePercent: number;
          sfxVolumePercent: number;
        },
        ack?: (
          response:
            | { ok: true; status: 'ACCOUNT_OK'; profile: AccountProfile }
            | { ok: true; status: 'AUTH_REQUIRED' | 'AUTH_INVALID' | 'UPDATE_REQUIRED' },
        ) => void,
      ) => {
        const requirement = getUpdateRequirement(socket, auth);
        if (requirement?.forceUpdate) {
          socket.emit('update_required', requirement);
          ack?.({ ok: true, status: 'UPDATE_REQUIRED' });
          return;
        }
        const userId = await registerSocketSession(socket, auth, { forceRevalidate: true });
        if (userId) {
          await trackSettingsAchievements({
            userId,
            isMusicMuted,
            isSfxMuted,
            musicVolumePercent,
            sfxVolumePercent,
          });
        }
        const account = await resolveAccount(auth);
        if (account.status === 'ACCOUNT_OK') {
          ack?.({ ok: true, status: 'ACCOUNT_OK', profile: account.profile });
          return;
        }
        ack?.({ ok: true, status: account.status });
      },
    );

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
      if (emitUpdateRequired(socket, auth)) return;
      await registerSocketSession(socket, auth);
      const profile = await resolvePlayerProfileCached(socket, auth, nickname);
      twoVsTwoStore.enqueue(socket.id, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic');
      const existingRoom = twoVsTwoStore.getBySocket(socket.id);
      tryStartTwoVsTwoTeamMatch();
      if (!existingRoom && !twoVsTwoStore.getBySocket(socket.id)) {
        socket.emit('twovtwo_matchmaking_waiting', {});
      }
    });

    socket.on(
      'join_ability',
      async (
        {
          nickname,
          auth,
          pieceSkin,
          boardSkin,
          equippedSkills,
          training,
        }: {
          nickname: string;
          auth?: AuthPayload;
          pieceSkin?: PieceSkin;
          boardSkin?: BoardSkin;
          equippedSkills: AbilitySkillId[];
          training?: boolean;
        },
      ) => {
        if (emitUpdateRequired(socket, auth)) return;
        await registerSocketSession(socket, auth);
        const profile = await resolvePlayerProfileCached(socket, auth, nickname);
        if (training) {
          const roomId = abilityStore.generateRoomId();
          const room = new AbilityRoom(roomId, roomId, io);
          room.enableTrainingMode();
          abilityStore.add(room);
          room.addPlayer(
            socket,
            profile.nickname,
            profile.userId,
            profile.stats,
            pieceSkin ?? 'classic',
            boardSkin ?? 'classic',
            equippedSkills,
          );
          room.addIdleBot('Training Dummy', 'classic', 'classic', []);
          abilityStore.registerSocket(socket.id, roomId);
          socket.emit('ability_room_joined', {
            roomId,
            color: 'red',
            opponentNickname: 'Training Dummy',
          });
          room.prepareGameStart();
          return;
        }
        const queued = abilityStore.dequeue();
        if (!queued || queued.socketId === socket.id) {
          if (queued) {
            abilityStore.enqueue(
              queued.socketId,
              queued.nickname,
              queued.userId,
              queued.stats,
              queued.pieceSkin,
              queued.boardSkin,
              queued.equippedSkills,
            );
          }
          abilityStore.enqueue(
            socket.id,
            profile.nickname,
            profile.userId,
            profile.stats,
            pieceSkin ?? 'classic',
            boardSkin ?? 'classic',
            equippedSkills,
          );
          socket.emit('ability_matchmaking_waiting', {});
          return;
        }

        const roomId = abilityStore.generateRoomId();
        const room = new AbilityRoom(roomId, roomId, io);
        abilityStore.add(room);

        const queuedSocket = io.sockets.sockets.get(queued.socketId);
        if (!queuedSocket) {
          abilityStore.enqueue(
            socket.id,
            profile.nickname,
            profile.userId,
            profile.stats,
            pieceSkin ?? 'classic',
            boardSkin ?? 'classic',
            equippedSkills,
          );
          socket.emit('ability_matchmaking_waiting', {});
          return;
        }

        room.addPlayer(
          queuedSocket,
          queued.nickname,
          queued.userId,
          queued.stats,
          queued.pieceSkin,
          queued.boardSkin,
          queued.equippedSkills,
        );
        abilityStore.registerSocket(queued.socketId, roomId);
        queuedSocket.emit('ability_room_joined', {
          roomId,
          color: 'red',
          opponentNickname: profile.nickname,
        });

        room.addPlayer(
          socket,
          profile.nickname,
          profile.userId,
          profile.stats,
          pieceSkin ?? 'classic',
          boardSkin ?? 'classic',
          equippedSkills,
        );
        abilityStore.registerSocket(socket.id, roomId);
        socket.emit('ability_room_joined', {
          roomId,
          color: 'blue',
          opponentNickname: queued.nickname,
        });

        room.prepareGameStart();
      },
    );

    socket.on('cancel_2v2', () => {
      twoVsTwoStore.removeFromQueue(socket.id);
    });

    socket.on('cancel_ability', () => {
      abilityStore.removeFromQueue(socket.id);
    });

    socket.on('twovtwo_client_ready', () => {
      const room = twoVsTwoStore.getBySocket(socket.id);
      room?.markClientReady(socket.id);
    });

    socket.on('ability_client_ready', () => {
      const room = abilityStore.getBySocket(socket.id);
      room?.markClientReady(socket.id);
    });

    socket.on('twovtwo_path_update', ({ path }: { path: Position[] }) => {
      const room = twoVsTwoStore.getBySocket(socket.id);
      room?.updatePlannedPath(socket.id, path);
    });

    socket.on(
      'ability_plan_update',
      ({
        path,
        skills,
      }: {
        path: Position[];
        skills: AbilitySkillReservation[];
      }) => {
        const room = abilityStore.getBySocket(socket.id);
        room?.updatePlan(socket.id, path, skills);
      },
    );

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

    socket.on(
      'ability_submit_plan',
      (
        {
          path,
          skills,
        }: {
          path: Position[];
          skills: AbilitySkillReservation[];
        },
        ack?: (
          response: {
            ok: boolean;
            acceptedPath: Position[];
            acceptedSkills: AbilitySkillReservation[];
          },
        ) => void,
      ) => {
        const room = abilityStore.getBySocket(socket.id);
        const result =
          room?.submitPlan(socket.id, path, skills) ?? {
            ok: false,
            acceptedPath: [],
            acceptedSkills: [],
          };
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
      const abilityRoom = abilityStore.getBySocket(socket.id);
      if (abilityRoom) {
        abilityRoom.requestRematch(socket.id);
        return;
      }

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
      if (twoVsTwoRoom) {
        twoVsTwoRoom.sendChat(socket.id, message);
        return;
      }
      const abilityRoom = abilityStore.getBySocket(socket.id);
      abilityRoom?.sendChat(socket.id, message);
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
      if (twoVsTwoRoom) {
        twoVsTwoRoom.updatePlayerSkin(socket.id, pieceSkin);
        return;
      }
      const abilityRoom = abilityStore.getBySocket(socket.id);
      abilityRoom?.updatePlayerSkin(socket.id, pieceSkin);
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
      clearRandomFallback(socket.id);
      console.log(`[-] Disconnected: ${socket.id}`);
      unregisterSocketSession(socket.id);
      store.removeFromQueue(socket.id);
      coopStore.removeFromQueue(socket.id);
      twoVsTwoStore.removeFromQueue(socket.id);
      abilityStore.removeFromQueue(socket.id);
      const { room, disconnectResult } = store.removeSocket(socket.id);
      const coopRoom = coopStore.removeSocket(socket.id);
      const twoVsTwoRoom = twoVsTwoStore.removeSocket(socket.id);
      const abilityRoom = abilityStore.removeSocket(socket.id);

      if (room && disconnectResult.disconnectedColor) {
        io.to(room.roomId).emit('opponent_disconnected', {});
      }

      if (abilityRoom.room && abilityRoom.disconnectResult.disconnectedColor) {
        io.to(abilityRoom.room.roomId).emit('opponent_disconnected', {});
      }

    });
  });
}


