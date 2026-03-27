"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwoVsTwoRoomStore = void 0;
class TwoVsTwoRoomStore {
    constructor() {
        this.rooms = new Map();
        this.socketToRoom = new Map();
        this.queue = [];
        this.teamQueue = [];
    }
    static getInstance() {
        if (!TwoVsTwoRoomStore.instance) {
            TwoVsTwoRoomStore.instance = new TwoVsTwoRoomStore();
        }
        return TwoVsTwoRoomStore.instance;
    }
    add(room) {
        this.rooms.set(room.roomId, room);
    }
    getBySocket(socketId) {
        const roomId = this.socketToRoom.get(socketId);
        return roomId ? this.rooms.get(roomId) : undefined;
    }
    registerSocket(socketId, roomId) {
        this.socketToRoom.set(socketId, roomId);
    }
    enqueue(socketId, nickname, userId, stats, pieceSkin) {
        this.queue.push({ socketId, nickname, userId, stats, pieceSkin });
    }
    dequeueGroup(size) {
        if (this.queue.length < size)
            return undefined;
        return this.queue.splice(0, size);
    }
    removeFromQueue(socketId) {
        this.queue = this.queue.filter((entry) => entry.socketId !== socketId);
        this.teamQueue = this.teamQueue
            .map((team) => ({
            members: team.members.filter((entry) => entry.socketId !== socketId),
        }))
            .filter((team) => team.members.length > 0);
    }
    enqueueTeam(members) {
        if (members.length !== 2)
            return;
        const deduped = members.filter((member, index) => members.findIndex((entry) => entry.socketId === member.socketId) === index);
        if (deduped.length !== 2)
            return;
        this.teamQueue.push({ members: deduped });
    }
    dequeueTeamMatch() {
        while (this.teamQueue.length < 2 && this.queue.length >= 2) {
            const pair = this.queue.splice(0, 2);
            if (pair.length === 2) {
                this.teamQueue.push({ members: pair });
            }
        }
        if (this.teamQueue.length < 2)
            return undefined;
        const first = this.teamQueue.shift();
        const second = this.teamQueue.shift();
        if (!first || !second)
            return undefined;
        return [first, second];
    }
    getStats() {
        return {
            roomCount: this.rooms.size,
            queueLength: this.queue.length,
            teamQueueLength: this.teamQueue.length,
            socketMappings: this.socketToRoom.size,
        };
    }
    sweep(activeSocketIds, now = Date.now()) {
        this.sweepQueue(activeSocketIds);
        this.sweepSocketMappings(activeSocketIds);
        this.sweepRooms(activeSocketIds, now);
    }
    removeSocket(socketId) {
        const roomId = this.socketToRoom.get(socketId);
        this.socketToRoom.delete(socketId);
        if (!roomId)
            return undefined;
        const room = this.rooms.get(roomId);
        if (!room)
            return undefined;
        room.removePlayer(socketId);
        if (room.connectedPlayerCount === 0 && room.currentPhase === 'waiting') {
            this.rooms.delete(roomId);
        }
        return room;
    }
    generateRoomId() {
        return `twovtwo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    }
    sweepQueue(activeSocketIds) {
        this.queue = this.queue.filter((entry) => activeSocketIds.has(entry.socketId));
        this.teamQueue = this.teamQueue
            .map((team) => ({
            members: team.members.filter((entry) => activeSocketIds.has(entry.socketId)),
        }))
            .filter((team) => team.members.length === 2);
    }
    sweepSocketMappings(activeSocketIds) {
        for (const [socketId, roomId] of this.socketToRoom.entries()) {
            if (!activeSocketIds.has(socketId) || !this.rooms.has(roomId)) {
                this.socketToRoom.delete(socketId);
            }
        }
    }
    sweepRooms(activeSocketIds, now) {
        for (const [roomId, room] of this.rooms.entries()) {
            const roomSocketIds = room.getSocketIds();
            const hasLiveSocket = roomSocketIds.some((socketId) => activeSocketIds.has(socketId));
            const isEmptyRoom = room.connectedPlayerCount === 0;
            const isStaleWaitingRoom = room.currentPhase === 'waiting' &&
                now - room.lastActivityTimestamp >= TwoVsTwoRoomStore.WAITING_ROOM_TIMEOUT_MS;
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
exports.TwoVsTwoRoomStore = TwoVsTwoRoomStore;
TwoVsTwoRoomStore.WAITING_ROOM_TIMEOUT_MS = 15 * 60 * 1000;
