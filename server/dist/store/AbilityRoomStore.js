"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbilityRoomStore = void 0;
class AbilityRoomStore {
    constructor() {
        this.rooms = new Map();
        this.codeToRoom = new Map();
        this.socketToRoom = new Map();
        this.queue = [];
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
        if (!AbilityRoomStore.instance)
            AbilityRoomStore.instance = new AbilityRoomStore();
        return AbilityRoomStore.instance;
    }
    normalizeCode(code) {
        return code.toUpperCase().replace(/[^A-Z0-9]/g, '');
    }
    add(room) {
        this.rooms.set(room.roomId, room);
        this.codeToRoom.set(this.normalizeCode(room.code), room.roomId);
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
    generateRoomId() {
        return `ability_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    }
    generateCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code;
        do {
            code = Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
        } while (this.codeToRoom.has(this.normalizeCode(code)));
        return code;
    }
    enqueue(socketId, nickname, userId, stats, pieceSkin, boardSkin, equippedSkills, currentRating = 0) {
        this.removeFromQueue(socketId);
        this.queue.push({ socketId, nickname, userId, stats, pieceSkin, boardSkin, equippedSkills, currentRating });
    }
    isQueued(socketId) {
        return this.queue.some((entry) => entry.socketId === socketId);
    }
    dequeue() {
        return this.queue.shift();
    }
    /** rating 차이 |range| 이내인 가장 오래 기다린 상대 반환. range가 undefined면 제한 없음. */
    dequeueWithinRange(currentRating, range) {
        if (this.queue.length === 0)
            return undefined;
        if (range === undefined) {
            return this.queue.shift();
        }
        const idx = this.queue.findIndex((entry) => Math.abs(entry.currentRating - currentRating) <= range);
        if (idx === -1)
            return undefined;
        const [entry] = this.queue.splice(idx, 1);
        return entry;
    }
    removeFromQueue(socketId) {
        this.queue = this.queue.filter((entry) => entry.socketId !== socketId);
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
            this.codeToRoom.delete(this.normalizeCode(room.code));
        }
        return { room, disconnectResult };
    }
    sweep(activeSocketIds, now = Date.now(), onRemove) {
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
            if (!isEmptyRoom &&
                !exceededTurnLimit &&
                !(isStaleWaitingRoom && !hasLiveSocket))
                continue;
            const reason = isEmptyRoom
                ? 'empty'
                : exceededTurnLimit
                    ? 'turn_limit'
                    : 'waiting_timeout';
            this.notifyRoomRemoved(room, roomId, roomSocketIds, reason, onRemove);
        }
    }
}
exports.AbilityRoomStore = AbilityRoomStore;
AbilityRoomStore.WAITING_ROOM_TIMEOUT_MS = 15 * 60 * 1000;
AbilityRoomStore.MAX_ACTIVE_TURN = 200;
