import { TwoVsTwoRoom } from '../game/twovtwo/TwoVsTwoRoom';
import type { PieceSkin } from '../types/game.types';

type QueueEntry = {
  socketId: string;
  nickname: string;
  userId: string | null;
  stats: { wins: number; losses: number };
  pieceSkin: PieceSkin;
};

type TeamQueueEntry = {
  members: QueueEntry[];
};

export class TwoVsTwoRoomStore {
  private rooms: Map<string, TwoVsTwoRoom> = new Map();
  private socketToRoom: Map<string, string> = new Map();
  private static readonly WAITING_ROOM_TIMEOUT_MS = 15 * 60 * 1000;
  private static readonly MAX_ACTIVE_TURN = 200;
  private queue: QueueEntry[] = [];
  private teamQueue: TeamQueueEntry[] = [];
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
    this.teamQueue = this.teamQueue
      .map((team) => ({
        members: team.members.filter((entry) => entry.socketId !== socketId),
      }))
      .filter((team) => team.members.length > 0);
  }

  enqueueTeam(members: QueueEntry[]): void {
    if (members.length !== 2) return;
    const deduped = members.filter(
      (member, index) =>
        members.findIndex((entry) => entry.socketId === member.socketId) === index,
    );
    if (deduped.length !== 2) return;
    this.teamQueue.push({ members: deduped });
  }

  dequeueTeamMatch(): [TeamQueueEntry, TeamQueueEntry] | undefined {
    while (this.teamQueue.length < 2 && this.queue.length >= 2) {
      const pair = this.queue.splice(0, 2);
      if (pair.length === 2) {
        this.teamQueue.push({ members: pair });
      }
    }

    if (this.teamQueue.length < 2) return undefined;
    const first = this.teamQueue.shift();
    const second = this.teamQueue.shift();
    if (!first || !second) return undefined;
    return [first, second];
  }

  getStats(): {
    roomCount: number;
    queueLength: number;
    teamQueueLength: number;
    socketMappings: number;
  } {
    return {
      roomCount: this.rooms.size,
      queueLength: this.queue.length,
      teamQueueLength: this.teamQueue.length,
      socketMappings: this.socketToRoom.size,
    };
  }

  sweep(activeSocketIds: Set<string>, now = Date.now()): void {
    this.sweepQueue(activeSocketIds);
    this.sweepSocketMappings(activeSocketIds);
    this.sweepRooms(activeSocketIds, now);
  }

  removeSocket(socketId: string): TwoVsTwoRoom | undefined {
    const roomId = this.socketToRoom.get(socketId);
    this.socketToRoom.delete(socketId);
    if (!roomId) return undefined;
    const room = this.rooms.get(roomId);
    if (!room) return undefined;
    room.removePlayer(socketId);
    if (room.connectedPlayerCount === 0 && room.currentPhase === 'waiting') {
      this.rooms.delete(roomId);
    }
    return room;
  }

  generateRoomId(): string {
    return `twovtwo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  private sweepQueue(activeSocketIds: Set<string>): void {
    this.queue = this.queue.filter((entry) => activeSocketIds.has(entry.socketId));
    this.teamQueue = this.teamQueue
      .map((team) => ({
        members: team.members.filter((entry) => activeSocketIds.has(entry.socketId)),
      }))
      .filter((team) => team.members.length === 2);
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
      const isEmptyRoom = room.connectedPlayerCount === 0;
      const exceededTurnLimit =
        room.currentTurn >= TwoVsTwoRoomStore.MAX_ACTIVE_TURN;
      const isStaleWaitingRoom =
        room.currentPhase === 'waiting' &&
        now - room.lastActivityTimestamp >= TwoVsTwoRoomStore.WAITING_ROOM_TIMEOUT_MS;

      if (
        !isEmptyRoom &&
        !exceededTurnLimit &&
        !(isStaleWaitingRoom && !hasLiveSocket)
      ) {
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
