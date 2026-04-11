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
    notifyRoomRemoved(room, roomId, roomSocketIds, reason, onRemove) {
        onRemove?.({
            roomId,
            socketIds: roomSocketIds,
            reason,
        });
        this.rooms.delete(roomId);
        for (const socketId of roomSocketIds) {
            if (this.socketToRoom.get(socketId) === roomId) {
                this.socketToRoom.delete(socketId);
            }
        }
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
    getStats() {
        return {
            roomCount: this.rooms.size,
            queueLength: this.queue.length,
            socketMappings: this.socketToRoom.size,
        };
    }
    sweep(activeSocketIds, now = Date.now(), onRemove) {
        this.sweepQueue(activeSocketIds);
        this.sweepSocketMappings(activeSocketIds);
        this.sweepRooms(activeSocketIds, now, onRemove);
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
        if (room.connectedPlayerCount === 0) {
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
    sweepRooms(activeSocketIds, now, onRemove) {
        for (const [roomId, room] of this.rooms.entries()) {
            const roomSocketIds = room.getSocketIds();
            const hasLiveSocket = roomSocketIds.some((socketId) => activeSocketIds.has(socketId));
            const isEmptyRoom = room.connectedPlayerCount === 0;
            const exceededTurnLimit = room.currentTurn >= CoopRoomStore.MAX_ACTIVE_TURN;
            const isStaleWaitingRoom = room.currentPhase === 'waiting' &&
                now - room.lastActivityTimestamp >= CoopRoomStore.WAITING_ROOM_TIMEOUT_MS;
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
exports.CoopRoomStore = CoopRoomStore;
CoopRoomStore.WAITING_ROOM_TIMEOUT_MS = 15 * 60 * 1000;
CoopRoomStore.MAX_ACTIVE_TURN = 200;
