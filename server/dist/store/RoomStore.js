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
    notifyRoomRemoved(room, roomId, roomSocketIds, reason, onRemove) {
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
    static getInstance() {
        if (!RoomStore.instance)
            RoomStore.instance = new RoomStore();
        return RoomStore.instance;
    }
    normalizeCode(code) {
        return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    }
    add(room) {
        this.rooms.set(room.roomId, room);
        this.codeToRoom.set(this.normalizeCode(room.code), room.roomId);
    }
    getById(roomId) {
        return this.rooms.get(roomId);
    }
    getByCode(code) {
        const normalizedCode = this.normalizeCode(code);
        const roomId = this.codeToRoom.get(normalizedCode);
        if (roomId)
            return this.rooms.get(roomId);
        for (const room of this.rooms.values()) {
            if (this.normalizeCode(room.code) === normalizedCode) {
                this.codeToRoom.set(normalizedCode, room.roomId);
                return room;
            }
        }
        return undefined;
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
            this.codeToRoom.delete(this.normalizeCode(room.code));
        }
        return { room, disconnectResult };
    }
    generateCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code;
        do {
            code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        } while (this.codeToRoom.has(this.normalizeCode(code)));
        return code;
    }
    generateRoomId() {
        return `room_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    }
    enqueueRandom(socketId, nickname, userId, stats, pieceSkin, boardSkin) {
        this.matchQueue = this.matchQueue.filter((entry) => entry.socketId !== socketId);
        this.matchQueue.push({ socketId, nickname, userId, stats, pieceSkin, boardSkin });
    }
    dequeueRandom() {
        return this.matchQueue.shift();
    }
    removeFromQueue(socketId) {
        this.matchQueue = this.matchQueue.filter((entry) => entry.socketId !== socketId);
    }
    isQueuedRandom(socketId) {
        return this.matchQueue.some((entry) => entry.socketId === socketId);
    }
    findRoomForRejoin(userId) {
        for (const room of this.rooms.values()) {
            if (room.hasDisconnectedUser(userId))
                return room;
        }
        return undefined;
    }
    getStats() {
        return {
            roomCount: this.rooms.size,
            queueLength: this.matchQueue.length,
            socketMappings: this.socketToRoom.size,
        };
    }
    sweep(activeSocketIds, now = Date.now(), onRemove) {
        this.sweepQueue(activeSocketIds);
        this.sweepSocketMappings(activeSocketIds);
        this.sweepRooms(activeSocketIds, now, onRemove);
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
    sweepRooms(activeSocketIds, now, onRemove) {
        for (const [roomId, room] of this.rooms.entries()) {
            const roomSocketIds = room.getSocketIds();
            const hasLiveSocket = roomSocketIds.some((socketId) => activeSocketIds.has(socketId));
            const isEmptyRoom = room.playerCount === 0;
            const exceededTurnLimit = room.currentTurn >= RoomStore.MAX_ACTIVE_TURN;
            const isStaleWaitingRoom = room.currentPhase === 'waiting' &&
                now - room.lastActivityTimestamp >= RoomStore.WAITING_ROOM_TIMEOUT_MS;
            if (!isEmptyRoom &&
                !exceededTurnLimit &&
                !(isStaleWaitingRoom && !hasLiveSocket)) {
                continue;
            }
            const reason = isEmptyRoom
                ? 'empty'
                : exceededTurnLimit
                    ? 'turn_limit'
                    : 'waiting_timeout';
            this.notifyRoomRemoved(room, roomId, roomSocketIds, reason, onRemove);
        }
    }
}
exports.RoomStore = RoomStore;
RoomStore.WAITING_ROOM_TIMEOUT_MS = 15 * 60 * 1000;
RoomStore.MAX_ACTIVE_TURN = 200;
