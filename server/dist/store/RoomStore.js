"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RoomStore = void 0;
class RoomStore {
    constructor() {
        this.rooms = new Map();
        this.codeToRoom = new Map(); // code → roomId
        this.socketToRoom = new Map(); // socketId → roomId
        // Random matchmaking queue
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
        if (!roomId)
            return undefined;
        const room = this.rooms.get(roomId);
        if (!room)
            return undefined;
        room.removePlayer(socketId);
        if (room.playerCount === 0) {
            this.rooms.delete(roomId);
            this.codeToRoom.delete(room.code);
        }
        return room;
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
    enqueueRandom(socketId, nickname) {
        this.matchQueue.push({ socketId, nickname });
    }
    dequeueRandom() {
        return this.matchQueue.shift();
    }
    removeFromQueue(socketId) {
        this.matchQueue = this.matchQueue.filter(e => e.socketId !== socketId);
    }
}
exports.RoomStore = RoomStore;
