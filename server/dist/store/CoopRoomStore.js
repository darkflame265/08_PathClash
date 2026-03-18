"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CoopRoomStore = void 0;
class CoopRoomStore {
    constructor() {
        this.rooms = new Map();
        this.socketToRoom = new Map();
        this.queue = [];
    }
    static getInstance() {
        if (!CoopRoomStore.instance) {
            CoopRoomStore.instance = new CoopRoomStore();
        }
        return CoopRoomStore.instance;
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
    dequeue() {
        return this.queue.shift();
    }
    removeFromQueue(socketId) {
        this.queue = this.queue.filter((entry) => entry.socketId !== socketId);
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
        if (room.playerCount === 0) {
            this.rooms.delete(roomId);
        }
        return room;
    }
    generateRoomId() {
        return `coop_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    }
    sweepQueue(activeSocketIds) {
        this.queue = this.queue.filter((entry) => activeSocketIds.has(entry.socketId));
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
            const isEmptyRoom = room.playerCount === 0;
            const isStaleWaitingRoom = room.currentPhase === 'waiting' &&
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
exports.CoopRoomStore = CoopRoomStore;
CoopRoomStore.WAITING_ROOM_TIMEOUT_MS = 15 * 60 * 1000;
