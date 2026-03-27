"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbilityRoomStore = void 0;
class AbilityRoomStore {
    constructor() {
        this.rooms = new Map();
        this.socketToRoom = new Map();
        this.queue = [];
    }
    static getInstance() {
        if (!AbilityRoomStore.instance)
            AbilityRoomStore.instance = new AbilityRoomStore();
        return AbilityRoomStore.instance;
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
    generateRoomId() {
        return `ability_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    }
    enqueue(socketId, nickname, userId, stats, pieceSkin, equippedSkills) {
        this.removeFromQueue(socketId);
        this.queue.push({ socketId, nickname, userId, stats, pieceSkin, equippedSkills });
    }
    dequeue() {
        return this.queue.shift();
    }
    removeFromQueue(socketId) {
        this.queue = this.queue.filter((entry) => entry.socketId !== socketId);
    }
    getStats() {
        return {
            roomCount: this.rooms.size,
            queueLength: this.queue.length,
            socketMappings: this.socketToRoom.size,
        };
    }
    removeSocket(socketId) {
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
    sweep(activeSocketIds, now = Date.now()) {
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
            if (!isEmptyRoom && !(isStaleWaitingRoom && !hasLiveSocket))
                continue;
            this.rooms.delete(roomId);
            for (const socketId of roomSocketIds) {
                if (this.socketToRoom.get(socketId) === roomId) {
                    this.socketToRoom.delete(socketId);
                }
            }
        }
    }
}
exports.AbilityRoomStore = AbilityRoomStore;
AbilityRoomStore.WAITING_ROOM_TIMEOUT_MS = 15 * 60 * 1000;
