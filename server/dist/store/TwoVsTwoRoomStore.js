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
        if (this.teamQueue.length < 2)
            return undefined;
        const first = this.teamQueue.shift();
        const second = this.teamQueue.shift();
        if (!first || !second)
            return undefined;
        return [first, second];
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
