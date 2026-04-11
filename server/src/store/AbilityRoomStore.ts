import { AbilityRoom } from '../game/ability/AbilityRoom';
import type { AbilitySkillId } from '../game/ability/AbilityTypes';
import type { BoardSkin, PieceSkin } from '../types/game.types';

export class AbilityRoomStore {
  private rooms = new Map<string, AbilityRoom>();
  private codeToRoom = new Map<string, string>();
  private socketToRoom = new Map<string, string>();
  private static readonly WAITING_ROOM_TIMEOUT_MS = 15 * 60 * 1000;
  private static readonly MAX_ACTIVE_TURN = 3;

  private notifyRoomRemoved(
    room: AbilityRoom,
    roomId: string,
    roomSocketIds: string[],
    reason: 'turn_limit' | 'waiting_timeout' | 'empty',
    onRemove?: (
      payload: {
        roomId: string;
        socketIds: string[];
        reason: 'turn_limit' | 'waiting_timeout' | 'empty';
      },
    ) => void,
  ) {
    onRemove?.({
      roomId,
      socketIds: roomSocketIds,
      reason,
    });

    this.rooms.delete(roomId);
    this.codeToRoom.delete(this.normalizeCode(room.code));
    for (const socketId of roomSocketIds) {
      if (this.socketToRoom.get(socketId) === roomId) {
        this.socketToRoom.delete(socketId);
      }
    }
  }

  private queue: Array<{
    socketId: string;
    nickname: string;
    userId: string | null;
    stats: { wins: number; losses: number };
    pieceSkin: PieceSkin;
    boardSkin: BoardSkin;
    equippedSkills: AbilitySkillId[];
  }> = [];

  private static instance: AbilityRoomStore;
  static getInstance(): AbilityRoomStore {
    if (!AbilityRoomStore.instance) AbilityRoomStore.instance = new AbilityRoomStore();
    return AbilityRoomStore.instance;
  }

  private normalizeCode(code: string): string {
    return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  }

  add(room: AbilityRoom): void {
    this.rooms.set(room.roomId, room);
    this.codeToRoom.set(this.normalizeCode(room.code), room.roomId);
  }

  getByCode(code: string): AbilityRoom | undefined {
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

  enqueue(
    socketId: string,
    nickname: string,
    userId: string | null,
    stats: { wins: number; losses: number },
    pieceSkin: PieceSkin,
    boardSkin: BoardSkin,
    equippedSkills: AbilitySkillId[],
  ): void {
    this.removeFromQueue(socketId);
    this.queue.push({ socketId, nickname, userId, stats, pieceSkin, boardSkin, equippedSkills });
  }

  dequeue(): {
    socketId: string;
    nickname: string;
    userId: string | null;
    stats: { wins: number; losses: number };
    pieceSkin: PieceSkin;
    boardSkin: BoardSkin;
    equippedSkills: AbilitySkillId[];
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
      this.codeToRoom.delete(this.normalizeCode(room.code));
    }
    return { room, disconnectResult };
  }

  sweep(
    activeSocketIds: Set<string>,
    now = Date.now(),
    onRemove?: (
      payload: {
        roomId: string;
        socketIds: string[];
        reason: 'turn_limit' | 'waiting_timeout' | 'empty';
      },
    ) => void,
  ): void {
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
      const exceededTurnLimit = room.currentTurn >= AbilityRoomStore.MAX_ACTIVE_TURN;
      const isStaleWaitingRoom = room.currentPhase === 'waiting' && now - room.lastActivityTimestamp >= AbilityRoomStore.WAITING_ROOM_TIMEOUT_MS;
      if (
        !isEmptyRoom &&
        !exceededTurnLimit &&
        !(isStaleWaitingRoom && !hasLiveSocket)
      ) continue;
      const reason: 'turn_limit' | 'waiting_timeout' | 'empty' = isEmptyRoom
        ? 'empty'
        : exceededTurnLimit
          ? 'turn_limit'
          : 'waiting_timeout';
      this.notifyRoomRemoved(room, roomId, roomSocketIds, reason, onRemove);
    }
  }
}
