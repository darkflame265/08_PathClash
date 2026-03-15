import { GameRoom } from '../game/GameRoom';

export class RoomStore {
  private rooms: Map<string, GameRoom> = new Map();
  private codeToRoom: Map<string, string> = new Map();
  private socketToRoom: Map<string, string> = new Map();
  private static readonly WAITING_ROOM_TIMEOUT_MS = 15 * 60 * 1000;

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

  removeSocket(socketId: string): {
    room: GameRoom | undefined;
    disconnectResult: {
      disconnectedColor: 'red' | 'blue' | null;
      shouldAwardDisconnectResult: boolean;
      winnerColor: 'red' | 'blue' | null;
    };
  } {
    const roomId = this.socketToRoom.get(socketId);
    this.socketToRoom.delete(socketId);
    if (!roomId) {
      return {
        room: undefined,
        disconnectResult: {
          disconnectedColor: null,
          shouldAwardDisconnectResult: false,
          winnerColor: null,
        },
      };
    }
    const room = this.rooms.get(roomId);
    if (!room) {
      return {
        room: undefined,
        disconnectResult: {
          disconnectedColor: null,
          shouldAwardDisconnectResult: false,
          winnerColor: null,
        },
      };
    }
    const disconnectResult = room.removePlayer(socketId);
    if (room.playerCount === 0 || !room.hasHumanPlayers()) {
      this.rooms.delete(roomId);
      this.codeToRoom.delete(room.code);
    }
    return { room, disconnectResult };
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

  private matchQueue: {
    socketId: string;
    nickname: string;
    userId: string | null;
    stats: { wins: number; losses: number };
    pieceSkin:
      | 'classic'
      | 'ember'
      | 'nova'
      | 'aurora'
      | 'void'
      | 'plasma'
      | 'gold_core'
      | 'neon_pulse'
      | 'cosmic'
      | 'inferno'
      | 'arc_reactor'
      | 'quantum'
      | 'atomic'
      | 'flag_kr'
      | 'flag_jp'
      | 'flag_cn'
      | 'flag_us'
      | 'flag_uk';
  }[] = [];

  enqueueRandom(
    socketId: string,
    nickname: string,
    userId: string | null,
    stats: { wins: number; losses: number },
    pieceSkin:
      | 'classic'
      | 'ember'
      | 'nova'
      | 'aurora'
      | 'void'
      | 'plasma'
      | 'gold_core'
      | 'neon_pulse'
      | 'cosmic'
      | 'inferno'
      | 'arc_reactor'
      | 'quantum'
      | 'atomic'
      | 'flag_kr'
      | 'flag_jp'
      | 'flag_cn'
      | 'flag_us'
      | 'flag_uk',
  ): void {
    this.matchQueue.push({ socketId, nickname, userId, stats, pieceSkin });
  }

  dequeueRandom(): {
    socketId: string;
    nickname: string;
    userId: string | null;
    stats: { wins: number; losses: number };
    pieceSkin:
      | 'classic'
      | 'ember'
      | 'nova'
      | 'aurora'
      | 'void'
      | 'plasma'
      | 'gold_core'
      | 'neon_pulse'
      | 'cosmic'
      | 'inferno'
      | 'arc_reactor'
      | 'quantum'
      | 'atomic'
      | 'flag_kr'
      | 'flag_jp'
      | 'flag_cn'
      | 'flag_us'
      | 'flag_uk';
  } | undefined {
    return this.matchQueue.shift();
  }

  removeFromQueue(socketId: string): void {
    this.matchQueue = this.matchQueue.filter((entry) => entry.socketId !== socketId);
  }

  sweep(activeSocketIds: Set<string>, now = Date.now()): void {
    this.sweepQueue(activeSocketIds);
    this.sweepSocketMappings(activeSocketIds);
    this.sweepRooms(activeSocketIds, now);
  }

  private sweepQueue(activeSocketIds: Set<string>): void {
    this.matchQueue = this.matchQueue.filter((entry) => activeSocketIds.has(entry.socketId));
  }

  private sweepSocketMappings(activeSocketIds: Set<string>): void {
    for (const [socketId, roomId] of this.socketToRoom.entries()) {
      if (!activeSocketIds.has(socketId) || !this.rooms.has(roomId)) {
        this.socketToRoom.delete(socketId);
      }
    }
  }

  private sweepRooms(activeSocketIds: Set<string>, now: number): void {
    for (const [roomId, room] of this.rooms.entries()) {
      const roomSocketIds = room.getSocketIds();
      const hasLiveSocket = roomSocketIds.some((socketId) => activeSocketIds.has(socketId));
      const isEmptyRoom = room.playerCount === 0;
      const isStaleWaitingRoom =
        room.currentPhase === 'waiting' &&
        now - room.lastActivityTimestamp >= RoomStore.WAITING_ROOM_TIMEOUT_MS;

      if (!isEmptyRoom && !(isStaleWaitingRoom && !hasLiveSocket)) {
        continue;
      }

      this.rooms.delete(roomId);
      this.codeToRoom.delete(room.code);

      for (const socketId of roomSocketIds) {
        if (this.socketToRoom.get(socketId) === roomId) {
          this.socketToRoom.delete(socketId);
        }
      }
    }
  }
}
