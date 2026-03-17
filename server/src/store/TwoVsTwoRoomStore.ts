import { TwoVsTwoRoom } from '../game/twovtwo/TwoVsTwoRoom';
import type { PieceSkin } from '../types/game.types';

type QueueEntry = {
  socketId: string;
  nickname: string;
  userId: string | null;
  stats: { wins: number; losses: number };
  pieceSkin: PieceSkin;
};

export class TwoVsTwoRoomStore {
  private rooms: Map<string, TwoVsTwoRoom> = new Map();
  private socketToRoom: Map<string, string> = new Map();
  private queue: QueueEntry[] = [];
  private static instance: TwoVsTwoRoomStore;

  static getInstance(): TwoVsTwoRoomStore {
    if (!TwoVsTwoRoomStore.instance) {
      TwoVsTwoRoomStore.instance = new TwoVsTwoRoomStore();
    }
    return TwoVsTwoRoomStore.instance;
  }

  add(room: TwoVsTwoRoom): void {
    this.rooms.set(room.roomId, room);
  }

  getBySocket(socketId: string): TwoVsTwoRoom | undefined {
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

  dequeueGroup(size: number): QueueEntry[] | undefined {
    if (this.queue.length < size) return undefined;
    return this.queue.splice(0, size);
  }

  removeFromQueue(socketId: string): void {
    this.queue = this.queue.filter((entry) => entry.socketId !== socketId);
  }

  removeSocket(socketId: string): TwoVsTwoRoom | undefined {
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
    return `twovtwo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }
}
