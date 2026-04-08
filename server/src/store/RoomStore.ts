import { GameRoom } from '../game/GameRoom';
import type { BoardSkin, PieceSkin } from '../types/game.types';

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

  private normalizeCode(code: string): string {
    return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  add(room: GameRoom): void {
    this.rooms.set(room.roomId, room);
    this.codeToRoom.set(this.normalizeCode(room.code), room.roomId);
  }

  getById(roomId: string): GameRoom | undefined {
    return this.rooms.get(roomId);
  }

  getByCode(code: string): GameRoom | undefined {
    const normalizedCode = this.normalizeCode(code);
    const roomId = this.codeToRoom.get(normalizedCode);
    if (roomId) return this.rooms.get(roomId);

    for (const room of this.rooms.values()) {
      if (this.normalizeCode(room.code) === normalizedCode) {
        this.codeToRoom.set(normalizedCode, room.roomId);
        return room;
      }
    }

    return undefined;
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
      this.codeToRoom.delete(this.normalizeCode(room.code));
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
    } while (this.codeToRoom.has(this.normalizeCode(code)));
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
    pieceSkin: PieceSkin;
    boardSkin: BoardSkin;
  }[] = [];

  enqueueRandom(
    socketId: string,
    nickname: string,
    userId: string | null,
    stats: { wins: number; losses: number },
    pieceSkin: PieceSkin,
    boardSkin: BoardSkin,
  ): void {
    this.matchQueue.push({ socketId, nickname, userId, stats, pieceSkin, boardSkin });
  }

  dequeueRandom(): {
    socketId: string;
    nickname: string;
    userId: string | null;
    stats: { wins: number; losses: number };
    pieceSkin: PieceSkin;
    boardSkin: BoardSkin;
  } | undefined {
    return this.matchQueue.shift();
  }

  removeFromQueue(socketId: string): void {
    this.matchQueue = this.matchQueue.filter((entry) => entry.socketId !== socketId);
  }

  getStats(): {
    roomCount: number;
    queueLength: number;
    socketMappings: number;
  } {
    return {
      roomCount: this.rooms.size,
      queueLength: this.matchQueue.length,
      socketMappings: this.socketToRoom.size,
    };
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
      this.codeToRoom.delete(this.normalizeCode(room.code));

      for (const socketId of roomSocketIds) {
        if (this.socketToRoom.get(socketId) === roomId) {
          this.socketToRoom.delete(socketId);
        }
      }
    }
  }
}
