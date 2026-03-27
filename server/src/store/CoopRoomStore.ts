import { CoopRoom } from '../game/coop/CoopRoom';
import type { PieceSkin } from '../types/game.types';

export class CoopRoomStore {
  private rooms: Map<string, CoopRoom> = new Map();
  private socketToRoom: Map<string, string> = new Map();
  private static readonly WAITING_ROOM_TIMEOUT_MS = 15 * 60 * 1000;
  private queue: {
    socketId: string;
    nickname: string;
    userId: string | null;
    stats: { wins: number; losses: number };
    pieceSkin: PieceSkin;
  }[] = [];
  private static instance: CoopRoomStore;

  static getInstance(): CoopRoomStore {
    if (!CoopRoomStore.instance) {
      CoopRoomStore.instance = new CoopRoomStore();
    }
    return CoopRoomStore.instance;
  }

  add(room: CoopRoom): void {
    this.rooms.set(room.roomId, room);
  }

  getBySocket(socketId: string): CoopRoom | undefined {
    const roomId = this.socketToRoom.get(socketId);
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  registerSocket(socketId: string, roomId: string): void {
    this.socketToRoom.set(socketId, roomId);
  }

  enqueue(
    socketId: string,
    nickname: string,
    userId: string | null,
    stats: { wins: number; losses: number },
    pieceSkin: PieceSkin,
  ): void {
    this.queue.push({ socketId, nickname, userId, stats, pieceSkin });
  }

  dequeue(): {
    socketId: string;
    nickname: string;
    userId: string | null;
    stats: { wins: number; losses: number };
    pieceSkin: PieceSkin;
  } | undefined {
    return this.queue.shift();
  }

  removeFromQueue(socketId: string): void {
    this.queue = this.queue.filter((entry) => entry.socketId !== socketId);
  }

  getStats(): {
    roomCount: number;
    queueLength: number;
    socketMappings: number;
  } {
    return {
      roomCount: this.rooms.size,
      queueLength: this.queue.length,
      socketMappings: this.socketToRoom.size,
    };
  }

  sweep(activeSocketIds: Set<string>, now = Date.now()): void {
    this.sweepQueue(activeSocketIds);
    this.sweepSocketMappings(activeSocketIds);
    this.sweepRooms(activeSocketIds, now);
  }

  removeSocket(socketId: string): CoopRoom | undefined {
    const roomId = this.socketToRoom.get(socketId);
    this.socketToRoom.delete(socketId);
    if (!roomId) return undefined;
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    room.removePlayer(socketId);
    if (room.playerCount === 0) {
      this.rooms.delete(roomId);
    }
    return room;
  }

  generateRoomId(): string {
    return `coop_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  private sweepQueue(activeSocketIds: Set<string>): void {
    this.queue = this.queue.filter((entry) => activeSocketIds.has(entry.socketId));
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
        now - room.lastActivityTimestamp >= CoopRoomStore.WAITING_ROOM_TIMEOUT_MS;

      if (!isEmptyRoom && !(isStaleWaitingRoom && !hasLiveSocket)) {
        continue;
      }

      this.rooms.delete(roomId);
      for (const socketId of roomSocketIds) {
        if (this.socketToRoom.get(socketId) === roomId) {
          this.socketToRoom.delete(socketId);
        }
      }
    }
  }
}
