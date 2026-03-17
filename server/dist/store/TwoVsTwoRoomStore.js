"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwoVsTwoRoomStore = void 0;
class TwoVsTwoRoomStore {
    constructor() {
        this.rooms = new Map();
        this.socketToRoom = new Map();
        this.queue = [];
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
        return `twovtwo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    }
}
exports.TwoVsTwoRoomStore = TwoVsTwoRoomStore;
