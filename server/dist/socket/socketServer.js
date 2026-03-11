"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initSocketServer = initSocketServer;
const GameRoom_1 = require("../game/GameRoom");
const RoomStore_1 = require("../store/RoomStore");
const playerAuth_1 = require("../services/playerAuth");
function initSocketServer(io) {
    const store = RoomStore_1.RoomStore.getInstance();
    io.on('connection', (socket) => {
        console.log(`[+] Connected: ${socket.id}`);
        socket.on('create_room', async ({ nickname, auth, pieceSkin }) => {
            const profile = await (0, playerAuth_1.resolvePlayerProfile)(auth, nickname);
            const roomId = store.generateRoomId();
            const code = store.generateCode();
            const room = new GameRoom_1.GameRoom(roomId, code, io, 'friend');
            const color = room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic');
            store.add(room);
            store.registerSocket(socket.id, roomId);
            socket.emit('room_created', { roomId, code, color, pieceSkin: pieceSkin ?? 'classic' });
        });
        socket.on('join_ai', async ({ nickname, auth, pieceSkin, tutorialPending, }) => {
            const profile = await (0, playerAuth_1.resolvePlayerProfile)(auth, nickname);
            const roomId = store.generateRoomId();
            const code = store.generateCode();
            const room = new GameRoom_1.GameRoom(roomId, code, io, 'ai');
            store.add(room);
            const humanColor = room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic');
            if (!humanColor) {
                socket.emit('join_error', { message: 'AI room creation failed.' });
                return;
            }
            room.addAiPlayer('PathClash AI');
            store.registerSocket(socket.id, roomId);
            const opponent = room.toClientState().players[humanColor === 'red' ? 'blue' : 'red'];
            socket.emit('room_joined', {
                roomId: room.roomId,
                color: humanColor,
                opponentNickname: opponent.nickname,
                selfPieceSkin: pieceSkin ?? 'classic',
                opponentPieceSkin: opponent.pieceSkin,
            });
            setTimeout(() => room.startGame(Boolean(tutorialPending)), 300);
        });
        socket.on('join_room', async ({ code, nickname, auth, pieceSkin }) => {
            const profile = await (0, playerAuth_1.resolvePlayerProfile)(auth, nickname);
            const room = store.getByCode(code.toUpperCase());
            if (!room || room.isFull) {
                socket.emit('join_error', { message: '방을 찾을 수 없거나 이미 가득 찼습니다.' });
                return;
            }
            const color = room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic');
            if (!color) {
                socket.emit('join_error', { message: '입장할 수 없습니다.' });
                return;
            }
            store.registerSocket(socket.id, room.roomId);
            const opponent = room.toClientState().players[color === 'red' ? 'blue' : 'red'];
            socket.emit('room_joined', {
                roomId: room.roomId,
                color,
                opponentNickname: opponent.nickname,
                selfPieceSkin: pieceSkin ?? 'classic',
                opponentPieceSkin: opponent.pieceSkin,
            });
            socket.to(room.roomId).emit('opponent_joined', {
                nickname: profile.nickname,
                color,
                pieceSkin: pieceSkin ?? 'classic',
            });
            setTimeout(() => room.startGame(), 500);
        });
        socket.on('join_random', async ({ nickname, auth, pieceSkin }) => {
            const profile = await (0, playerAuth_1.resolvePlayerProfile)(auth, nickname);
            const queued = store.dequeueRandom();
            if (!queued || queued.socketId === socket.id) {
                if (queued) {
                    store.enqueueRandom(queued.socketId, queued.nickname, queued.userId, queued.stats, queued.pieceSkin);
                }
                store.enqueueRandom(socket.id, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic');
                socket.emit('matchmaking_waiting', {});
                return;
            }
            const roomId = store.generateRoomId();
            const code = store.generateCode();
            const room = new GameRoom_1.GameRoom(roomId, code, io, 'random');
            store.add(room);
            const queuedSocket = io.sockets.sockets.get(queued.socketId);
            if (!queuedSocket) {
                store.enqueueRandom(socket.id, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic');
                socket.emit('matchmaking_waiting', {});
                return;
            }
            room.addPlayer(queuedSocket, queued.nickname, queued.userId, queued.stats, queued.pieceSkin);
            store.registerSocket(queued.socketId, roomId);
            queuedSocket.emit('room_joined', {
                roomId,
                color: 'red',
                opponentNickname: profile.nickname,
                selfPieceSkin: queued.pieceSkin,
                opponentPieceSkin: pieceSkin ?? 'classic',
            });
            room.addPlayer(socket, profile.nickname, profile.userId, profile.stats, pieceSkin ?? 'classic');
            store.registerSocket(socket.id, roomId);
            socket.emit('room_joined', {
                roomId,
                color: 'blue',
                opponentNickname: queued.nickname,
                selfPieceSkin: pieceSkin ?? 'classic',
                opponentPieceSkin: queued.pieceSkin,
            });
            setTimeout(() => room.startGame(), 500);
        });
        socket.on('cancel_random', () => {
            store.removeFromQueue(socket.id);
        });
        socket.on('account_sync', async ({ auth }, ack) => {
            ack?.(await (0, playerAuth_1.resolveAccount)(auth));
        });
        socket.on('finalize_google_upgrade', async ({ auth, guestAuth, guestProfile, flowStartedAt, }, ack) => {
            ack?.(await (0, playerAuth_1.finalizeGoogleUpgrade)(auth, guestAuth, guestProfile, flowStartedAt));
        });
        socket.on('path_update', ({ path }) => {
            const room = store.getBySocket(socket.id);
            room?.updatePlannedPath(socket.id, path);
        });
        socket.on('submit_path', ({ path }, ack) => {
            const room = store.getBySocket(socket.id);
            const ok = room?.submitPath(socket.id, path) ?? false;
            ack?.({ ok });
        });
        socket.on('request_rematch', () => {
            const room = store.getBySocket(socket.id);
            room?.requestRematch(socket.id);
        });
        socket.on('resume_tutorial', () => {
            const room = store.getBySocket(socket.id);
            room?.resumeTutorial(socket.id);
        });
        socket.on('chat_send', ({ message }) => {
            const room = store.getBySocket(socket.id);
            room?.sendChat(socket.id, message);
        });
        socket.on('update_piece_skin', ({ pieceSkin }) => {
            const room = store.getBySocket(socket.id);
            room?.updatePlayerSkin(socket.id, pieceSkin);
        });
        socket.on('disconnect', () => {
            console.log(`[-] Disconnected: ${socket.id}`);
            store.removeFromQueue(socket.id);
            const room = store.removeSocket(socket.id);
            if (room && room.playerCount > 0) {
                io.to(room.roomId).emit('opponent_disconnected', {});
            }
        });
    });
}
