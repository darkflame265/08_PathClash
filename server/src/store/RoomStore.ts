import { GameRoom } from '../game/GameRoom';

export class RoomStore {
  private rooms: Map<string, GameRoom> = new Map();
  private codeToRoom: Map<string, string> = new Map(); // code → roomId
  private socketToRoom: Map<string, string> = new Map(); // socketId → roomId

  private static instance: RoomStore;
  static getInstance(): RoomStore {
    if (!RoomStore.instance) RoomStore.instance = new RoomStore();
    return RoomStore.instance;
  }

  add(room: GameRoom): void {
    this.rooms.set(room.roomId, room);
    this.codeToRoom.set(room.code, room.roomId);
  }

  getById(roomId: string): GameRoom | undefined {
    return this.rooms.get(roomId);
  }

  getByCode(code: string): GameRoom | undefined {
    const roomId = this.codeToRoom.get(code);
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  getBySocket(socketId: string): GameRoom | undefined {
    const roomId = this.socketToRoom.get(socketId);
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  registerSocket(socketId: string, roomId: string): void {
    this.socketToRoom.set(socketId, roomId);
  }

  removeSocket(socketId: string): GameRoom | undefined {
    const roomId = this.socketToRoom.get(socketId);
    this.socketToRoom.delete(socketId);
    if (!roomId) return undefined;
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    room.removePlayer(socketId);
    if (room.playerCount === 0 || !room.hasHumanPlayers()) {
      this.rooms.delete(roomId);
      this.codeToRoom.delete(room.code);
    }
    return room;
  }

  generateCode(): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code: string;
    do {
      code = Array.from({ length: 6 }, () =>
        chars[Math.floor(Math.random() * chars.length)]
      ).join('');
    } while (this.codeToRoom.has(code));
    return code;
  }

  generateRoomId(): string {
    return `room_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  // Random matchmaking queue
  private matchQueue: {
    socketId: string;
    nickname: string;
    userId: string | null;
    stats: { wins: number; losses: number };
  }[] = [];

  enqueueRandom(
    socketId: string,
    nickname: string,
    userId: string | null,
    stats: { wins: number; losses: number },
  ): void {
    this.matchQueue.push({ socketId, nickname, userId, stats });
  }

  dequeueRandom(): {
    socketId: string;
    nickname: string;
    userId: string | null;
    stats: { wins: number; losses: number };
  } | undefined {
    return this.matchQueue.shift();
  }

  removeFromQueue(socketId: string): void {
    this.matchQueue = this.matchQueue.filter(e => e.socketId !== socketId);
  }
}
