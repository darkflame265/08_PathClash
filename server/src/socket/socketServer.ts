import { Server, Socket } from 'socket.io';
import { GameRoom } from '../game/GameRoom';
import { RoomStore } from '../store/RoomStore';
import { Position } from '../types/game.types';
import {
  AuthPayload,
  finalizeGoogleUpgrade,
  resolveAccount,
  resolvePlayerProfile,
} from '../services/playerAuth';

export function initSocketServer(io: Server): void {
  const store = RoomStore.getInstance();

  io.on('connection', (socket: Socket) => {
    console.log(`[+] Connected: ${socket.id}`);

    socket.on('create_room', async ({ nickname, auth }: { nickname: string; auth?: AuthPayload }) => {
      const profile = await resolvePlayerProfile(auth, nickname);
      const roomId = store.generateRoomId();
      const code = store.generateCode();
      const room = new GameRoom(roomId, code, io, 'friend');
      const color = room.addPlayer(socket, profile.nickname, profile.userId, profile.stats);
      store.add(room);
      store.registerSocket(socket.id, roomId);
      socket.emit('room_created', { roomId, code, color });
    });

    socket.on('join_ai', async ({ nickname, auth }: { nickname: string; auth?: AuthPayload }) => {
      const profile = await resolvePlayerProfile(auth, nickname);
      const roomId = store.generateRoomId();
      const code = store.generateCode();
      const room = new GameRoom(roomId, code, io, 'ai');
      store.add(room);

      const humanColor = room.addPlayer(socket, profile.nickname, profile.userId, profile.stats);
      if (!humanColor) {
        socket.emit('join_error', { message: 'AI room creation failed.' });
        return;
      }

      room.addAiPlayer('PathClash AI');
      store.registerSocket(socket.id, roomId);

      const opponent = room.toClientState().players[humanColor === 'red' ? 'blue' : 'red'];
      socket.emit('room_joined', {
        roomId: room.roomId,
        color: humanColor,
        opponentNickname: opponent.nickname,
      });

      setTimeout(() => room.startGame(), 300);
    });

    socket.on('join_room', async ({ code, nickname, auth }: { code: string; nickname: string; auth?: AuthPayload }) => {
      const profile = await resolvePlayerProfile(auth, nickname);
      const room = store.getByCode(code.toUpperCase());
      if (!room || room.isFull) {
        socket.emit('join_error', { message: '방을 찾을 수 없거나 이미 가득 찼습니다.' });
        return;
      }

      const color = room.addPlayer(socket, profile.nickname, profile.userId, profile.stats);
      if (!color) {
        socket.emit('join_error', { message: '입장할 수 없습니다.' });
        return;
      }

      store.registerSocket(socket.id, room.roomId);
      const opponent = room.toClientState().players[color === 'red' ? 'blue' : 'red'];
      socket.emit('room_joined', { roomId: room.roomId, color, opponentNickname: opponent.nickname });
      socket.to(room.roomId).emit('opponent_joined', { nickname: profile.nickname });

      setTimeout(() => room.startGame(), 500);
    });

    socket.on('join_random', async ({ nickname, auth }: { nickname: string; auth?: AuthPayload }) => {
      const profile = await resolvePlayerProfile(auth, nickname);
      const queued = store.dequeueRandom();
      if (!queued || queued.socketId === socket.id) {
        if (queued) {
          store.enqueueRandom(queued.socketId, queued.nickname, queued.userId, queued.stats);
        }
        store.enqueueRandom(socket.id, profile.nickname, profile.userId, profile.stats);
        socket.emit('matchmaking_waiting', {});
        return;
      }

      const roomId = store.generateRoomId();
      const code = store.generateCode();
      const room = new GameRoom(roomId, code, io, 'random');
      store.add(room);

      const queuedSocket = io.sockets.sockets.get(queued.socketId);
      if (!queuedSocket) {
        store.enqueueRandom(socket.id, profile.nickname, profile.userId, profile.stats);
        socket.emit('matchmaking_waiting', {});
        return;
      }

      room.addPlayer(queuedSocket, queued.nickname, queued.userId, queued.stats);
      store.registerSocket(queued.socketId, roomId);
      queuedSocket.emit('room_joined', {
        roomId,
        color: 'red',
        opponentNickname: profile.nickname,
      });

      room.addPlayer(socket, profile.nickname, profile.userId, profile.stats);
      store.registerSocket(socket.id, roomId);
      socket.emit('room_joined', {
        roomId,
        color: 'blue',
        opponentNickname: queued.nickname,
      });

      setTimeout(() => room.startGame(), 500);
    });

    socket.on('cancel_random', () => {
      store.removeFromQueue(socket.id);
    });

    socket.on('account_sync', async ({ auth }: { auth?: AuthPayload }, ack?: (response: unknown) => void) => {
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
        }: {
          auth?: AuthPayload;
          guestAuth?: AuthPayload;
          guestProfile?: { nickname: string | null; wins: number; losses: number };
          flowStartedAt?: string;
        },
        ack?: (response: unknown) => void,
      ) => {
        ack?.(await finalizeGoogleUpgrade(auth, guestAuth, guestProfile, flowStartedAt));
      },
    );

    socket.on('path_update', ({ path }: { path: Position[] }) => {
      const room = store.getBySocket(socket.id);
      room?.updatePlannedPath(socket.id, path);
    });

    socket.on('submit_path', ({ path }: { path: Position[] }, ack?: (response: { ok: boolean }) => void) => {
      const room = store.getBySocket(socket.id);
      const ok = room?.submitPath(socket.id, path) ?? false;
      ack?.({ ok });
    });

    socket.on('request_rematch', () => {
      const room = store.getBySocket(socket.id);
      room?.requestRematch(socket.id);
    });

    socket.on('chat_send', ({ message }: { message: string }) => {
      const room = store.getBySocket(socket.id);
      room?.sendChat(socket.id, message);
    });

    socket.on('disconnect', () => {
      console.log(`[-] Disconnected: ${socket.id}`);
      store.removeFromQueue(socket.id);
      const room = store.removeSocket(socket.id);
      if (room && room.playerCount > 0) {
        io.to(room.roomId).emit('opponent_disconnected', {});
      }
    });
  });
}
