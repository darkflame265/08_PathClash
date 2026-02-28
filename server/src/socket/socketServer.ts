import { Server, Socket } from 'socket.io';
import { RoomStore } from '../store/RoomStore';
import { GameRoom } from '../game/GameRoom';
import { Position } from '../types/game.types';

export function initSocketServer(io: Server): void {
  const store = RoomStore.getInstance();

  io.on('connection', (socket: Socket) => {
    console.log(`[+] Connected: ${socket.id}`);

    // ─── Room creation (friend match) ───────────────────────────────────────
    socket.on('create_room', ({ nickname }: { nickname: string }) => {
      const roomId = store.generateRoomId();
      const code = store.generateCode();
      const room = new GameRoom(roomId, code, io);
      const color = room.addPlayer(socket, nickname.slice(0, 16) || 'Guest');
      store.add(room);
      store.registerSocket(socket.id, roomId);
      socket.emit('room_created', { roomId, code, color });
    });

    // ─── Join by code ────────────────────────────────────────────────────────
    socket.on('join_room', ({ code, nickname }: { code: string; nickname: string }) => {
      const room = store.getByCode(code.toUpperCase());
      if (!room || room.isFull) {
        socket.emit('join_error', { message: '방을 찾을 수 없거나 가득 찼습니다.' });
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

      // Start game when full
      setTimeout(() => room.startGame(), 500);
    });

    // ─── Random matchmaking ──────────────────────────────────────────────────
    socket.on('join_random', ({ nickname }: { nickname: string }) => {
      const queued = store.dequeueRandom();
      if (!queued || queued.socketId === socket.id) {
        // No match yet — enqueue self
        if (queued) store.enqueueRandom(queued.socketId, queued.nickname);
        store.enqueueRandom(socket.id, nickname.slice(0, 16) || 'Guest');
        socket.emit('matchmaking_waiting', {});
        return;
      }

      // Create room with queued player as red
      const roomId = store.generateRoomId();
      const code = store.generateCode();
      const room = new GameRoom(roomId, code, io);
      store.add(room);

      const queuedSocket = io.sockets.sockets.get(queued.socketId);
      if (!queuedSocket) {
        // Queued player disconnected
        store.enqueueRandom(socket.id, nickname);
        return;
      }

      room.addPlayer(queuedSocket, queued.nickname);
      store.registerSocket(queued.socketId, roomId);
      queuedSocket.emit('room_joined', {
        roomId, color: 'red',
        opponentNickname: nickname.slice(0, 16) || 'Guest',
      });

      room.addPlayer(socket, nickname.slice(0, 16) || 'Guest');
      store.registerSocket(socket.id, roomId);
      socket.emit('room_joined', { roomId, color: 'blue', opponentNickname: queued.nickname });

      setTimeout(() => room.startGame(), 500);
    });

    // ─── Path submission ─────────────────────────────────────────────────────
    socket.on('submit_path', ({ path }: { path: Position[] }) => {
      const room = store.getBySocket(socket.id);
      room?.submitPath(socket.id, path);
    });

    // ─── Rematch ─────────────────────────────────────────────────────────────
    socket.on('request_rematch', () => {
      const room = store.getBySocket(socket.id);
      room?.requestRematch(socket.id);
    });

    // ─── Chat ────────────────────────────────────────────────────────────────
    socket.on('chat_send', ({ message }: { message: string }) => {
      const room = store.getBySocket(socket.id);
      room?.sendChat(socket.id, message);
    });

    // ─── Disconnect ──────────────────────────────────────────────────────────
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
