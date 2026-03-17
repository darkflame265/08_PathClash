import { CoopRoom } from '../game/coop/CoopRoom';
import type { PieceSkin } from '../types/game.types';

export class CoopRoomStore {
  private rooms: Map<string, CoopRoom> = new Map();
  private socketToRoom: Map<string, string> = new Map();
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
}
