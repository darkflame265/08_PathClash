import { AbilityRoom } from '../game/ability/AbilityRoom';
import type { AbilitySkillId } from '../game/ability/AbilityTypes';
import type { PieceSkin } from '../types/game.types';

export class AbilityRoomStore {
  private rooms = new Map<string, AbilityRoom>();
  private socketToRoom = new Map<string, string>();
  private static readonly WAITING_ROOM_TIMEOUT_MS = 15 * 60 * 1000;

  private queue: Array<{
    socketId: string;
    nickname: string;
    userId: string | null;
    stats: { wins: number; losses: number };
    pieceSkin: PieceSkin;
    equippedSkills: AbilitySkillId[];
  }> = [];

  private static instance: AbilityRoomStore;
  static getInstance(): AbilityRoomStore {
    if (!AbilityRoomStore.instance) AbilityRoomStore.instance = new AbilityRoomStore();
    return AbilityRoomStore.instance;
  }

  add(room: AbilityRoom): void {
    this.rooms.set(room.roomId, room);
  }

  getBySocket(socketId: string): AbilityRoom | undefined {
    const roomId = this.socketToRoom.get(socketId);
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  registerSocket(socketId: string, roomId: string): void {
    this.socketToRoom.set(socketId, roomId);
  }

  generateRoomId(): string {
    return `ability_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  enqueue(
    socketId: string,
    nickname: string,
    userId: string | null,
    stats: { wins: number; losses: number },
    pieceSkin: PieceSkin,
    equippedSkills: AbilitySkillId[],
  ): void {
    this.removeFromQueue(socketId);
    this.queue.push({ socketId, nickname, userId, stats, pieceSkin, equippedSkills });
  }

  dequeue(): {
    socketId: string;
    nickname: string;
    userId: string | null;
    stats: { wins: number; losses: number };
    pieceSkin: PieceSkin;
    equippedSkills: AbilitySkillId[];
  } | undefined {
    return this.queue.shift();
  }

  removeFromQueue(socketId: string): void {
    this.queue = this.queue.filter((entry) => entry.socketId !== socketId);
  }

  removeSocket(socketId: string): {
    room: AbilityRoom | undefined;
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
    if (room.playerCount === 0) {
      this.rooms.delete(roomId);
    }
    return { room, disconnectResult };
  }

  sweep(activeSocketIds: Set<string>, now = Date.now()): void {
    this.queue = this.queue.filter((entry) => activeSocketIds.has(entry.socketId));
    for (const [socketId, roomId] of this.socketToRoom.entries()) {
      if (!activeSocketIds.has(socketId) || !this.rooms.has(roomId)) {
        this.socketToRoom.delete(socketId);
      }
    }
    for (const [roomId, room] of this.rooms.entries()) {
      const roomSocketIds = room.getSocketIds();
      const hasLiveSocket = roomSocketIds.some((socketId) => activeSocketIds.has(socketId));
      const isEmptyRoom = room.playerCount === 0;
      const isStaleWaitingRoom = room.currentPhase === 'waiting' && now - room.lastActivityTimestamp >= AbilityRoomStore.WAITING_ROOM_TIMEOUT_MS;
      if (!isEmptyRoom && !(isStaleWaitingRoom && !hasLiveSocket)) continue;
      this.rooms.delete(roomId);
      for (const socketId of roomSocketIds) {
        if (this.socketToRoom.get(socketId) === roomId) {
          this.socketToRoom.delete(socketId);
        }
      }
    }
  }
}
