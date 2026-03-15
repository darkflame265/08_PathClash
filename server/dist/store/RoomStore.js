"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomStore = void 0;
class RoomStore {
    constructor() {
        this.rooms = new Map();
        this.codeToRoom = new Map();
        this.socketToRoom = new Map();
        this.matchQueue = [];
    }
    static getInstance() {
        if (!RoomStore.instance)
            RoomStore.instance = new RoomStore();
        return RoomStore.instance;
    }
    add(room) {
        this.rooms.set(room.roomId, room);
        this.codeToRoom.set(room.code, room.roomId);
    }
    getById(roomId) {
        return this.rooms.get(roomId);
    }
    getByCode(code) {
        const roomId = this.codeToRoom.get(code);
        return roomId ? this.rooms.get(roomId) : undefined;
    }
    getBySocket(socketId) {
        const roomId = this.socketToRoom.get(socketId);
        return roomId ? this.rooms.get(roomId) : undefined;
    }
    registerSocket(socketId, roomId) {
        this.socketToRoom.set(socketId, roomId);
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
        if (room.playerCount === 0 || !room.hasHumanPlayers()) {
            this.rooms.delete(roomId);
            this.codeToRoom.delete(room.code);
        }
        return { room, disconnectResult };
    }
    generateCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code;
        do {
            code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        } while (this.codeToRoom.has(code));
        return code;
    }
    generateRoomId() {
        return `room_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    }
    enqueueRandom(socketId, nickname, userId, stats, pieceSkin) {
        this.matchQueue.push({ socketId, nickname, userId, stats, pieceSkin });
    }
    dequeueRandom() {
        return this.matchQueue.shift();
    }
    removeFromQueue(socketId) {
        this.matchQueue = this.matchQueue.filter((entry) => entry.socketId !== socketId);
    }
    sweep(activeSocketIds, now = Date.now()) {
        this.sweepQueue(activeSocketIds);
        this.sweepSocketMappings(activeSocketIds);
        this.sweepRooms(activeSocketIds, now);
    }
    sweepQueue(activeSocketIds) {
        this.matchQueue = this.matchQueue.filter((entry) => activeSocketIds.has(entry.socketId));
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
                now - room.lastActivityTimestamp >= RoomStore.WAITING_ROOM_TIMEOUT_MS;
            if (!isEmptyRoom && !(isStaleWaitingRoom && !hasLiveSocket)) {
                continue;
            }
            this.rooms.delete(roomId);
            this.codeToRoom.delete(room.code);
            for (const socketId of roomSocketIds) {
                if (this.socketToRoom.get(socketId) === roomId) {
                    this.socketToRoom.delete(socketId);
                }
            }
        }
    }
}
exports.RoomStore = RoomStore;
RoomStore.WAITING_ROOM_TIMEOUT_MS = 15 * 60 * 1000;
