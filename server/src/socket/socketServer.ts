import { Server, Socket } from 'socket.io';
import { GameRoom } from '../game/GameRoom';
import { RoomStore } from '../store/RoomStore';
import { Position } from '../types/game.types';

export function initSocketServer(io: Server): void {
  const store = RoomStore.getInstance();

  io.on('connection', (socket: Socket) => {
    console.log(`[+] Connected: ${socket.id}`);

    socket.on('create_room', ({ nickname }: { nickname: string }) => {
      const roomId = store.generateRoomId();
      const code = store.generateCode();
      const room = new GameRoom(roomId, code, io);
      const color = room.addPlayer(socket, nickname.slice(0, 16) || 'Guest');
      store.add(room);
      store.registerSocket(socket.id, roomId);
      socket.emit('room_created', { roomId, code, color });
    });

    socket.on('join_ai', ({ nickname }: { nickname: string }) => {
      const roomId = store.generateRoomId();
      const code = store.generateCode();
      const room = new GameRoom(roomId, code, io);
      store.add(room);

      const humanColor = room.addPlayer(socket, nickname.slice(0, 16) || 'Guest');
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

    socket.on('join_room', ({ code, nickname }: { code: string; nickname: string }) => {
      const room = store.getByCode(code.toUpperCase());
      if (!room || room.isFull) {
        socket.emit('join_error', { message: '방을 찾을 수 없거나 이미 가득 찼습니다.' });
        return;
      }

      const color = room.addPlayer(socket, nickname.slice(0, 16) || 'Guest');
      if (!color) {
        socket.emit('join_error', { message: '입장할 수 없습니다.' });
        return;
      }

      store.registerSocket(socket.id, room.roomId);
      const opponent = room.toClientState().players[color === 'red' ? 'blue' : 'red'];
      socket.emit('room_joined', { roomId: room.roomId, color, opponentNickname: opponent.nickname });
      socket.to(room.roomId).emit('opponent_joined', { nickname: nickname.slice(0, 16) || 'Guest' });

      setTimeout(() => room.startGame(), 500);
    });

    socket.on('join_random', ({ nickname }: { nickname: string }) => {
      const queued = store.dequeueRandom();
      if (!queued || queued.socketId === socket.id) {
        if (queued) {
          store.enqueueRandom(queued.socketId, queued.nickname);
        }
        store.enqueueRandom(socket.id, nickname.slice(0, 16) || 'Guest');
        socket.emit('matchmaking_waiting', {});
        return;
      }

      const roomId = store.generateRoomId();
      const code = store.generateCode();
      const room = new GameRoom(roomId, code, io);
      store.add(room);

      const queuedSocket = io.sockets.sockets.get(queued.socketId);
      if (!queuedSocket) {
        store.enqueueRandom(socket.id, nickname.slice(0, 16) || 'Guest');
        socket.emit('matchmaking_waiting', {});
        return;
      }

      room.addPlayer(queuedSocket, queued.nickname);
      store.registerSocket(queued.socketId, roomId);
      queuedSocket.emit('room_joined', {
        roomId,
        color: 'red',
        opponentNickname: nickname.slice(0, 16) || 'Guest',
      });

      room.addPlayer(socket, nickname.slice(0, 16) || 'Guest');
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
