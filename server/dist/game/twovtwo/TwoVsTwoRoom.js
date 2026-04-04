"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TwoVsTwoRoom = void 0;
const ServerTimer_1 = require("../ServerTimer");
const TwoVsTwoEngine_1 = require("./TwoVsTwoEngine");
const playerAuth_1 = require("../../services/playerAuth");
const achievementService_1 = require("../../services/achievementService");
const PLANNING_TIME_MS = 7000;
const SUBMIT_GRACE_MS = 350;
const MOVEMENT_STEP_MS = 200;
const MOVEMENT_SETTLE_MS = 300;
function calcAnimationDuration(maxSteps) {
    return Math.max(350, maxSteps * MOVEMENT_STEP_MS + MOVEMENT_SETTLE_MS);
}
class TwoVsTwoRoom {
    constructor(roomId, code, io) {
        this.createdAt = Date.now();
        this.lastActivityAt = Date.now();
        this.phase = 'waiting';
        this.players = new Map();
        this.turn = 1;
        this.attackerTeam = 'red';
        this.obstacles = [];
        this.timer = new ServerTimer_1.ServerTimer();
        this.readySockets = new Set();
        this.pendingStart = false;
        this.rematchSet = new Set();
        this.rematchQueuedTeams = new Set();
        this.gameResult = null;
        this.rewardsGranted = false;
        this.planningGraceTimeout = null;
        this.nextRoundTimeout = null;
        this.roomId = roomId;
        this.code = code;
        this.io = io;
    }
    get playerCount() {
        return this.players.size;
    }
    get connectedPlayerCount() {
        return [...this.players.values()].filter((player) => player.connected).length;
    }
    get currentPhase() {
        return this.phase;
    }
    get createdTimestamp() {
        return this.createdAt;
    }
    get lastActivityTimestamp() {
        return this.lastActivityAt;
    }
    get currentResult() {
        return this.gameResult;
    }
    addPlayer(socket, nickname, userId, stats, pieceSkin, boardSkin = 'classic') {
        if (this.players.size >= 4)
            return null;
        const slot = TwoVsTwoEngine_1.TWO_VS_TWO_SLOTS.find((entry) => !this.players.has(entry)) ?? null;
        if (!slot)
            return null;
        const positions = (0, TwoVsTwoEngine_1.getTwoVsTwoInitialPositions)();
        this.players.set(slot, {
            id: userId ?? socket.id,
            userId,
            socketId: socket.id,
            nickname,
            color: (0, TwoVsTwoEngine_1.getSlotTeam)(slot),
            team: (0, TwoVsTwoEngine_1.getSlotTeam)(slot),
            slot,
            pieceSkin,
            boardSkin,
            hp: 3,
            position: { ...positions[slot] },
            plannedPath: [],
            pathSubmitted: false,
            role: (0, TwoVsTwoEngine_1.getSlotTeam)(slot) === 'red' ? 'attacker' : 'escaper',
            connected: true,
            stats,
        });
        socket.join(this.roomId);
        this.touchActivity();
        return slot;
    }
    removePlayer(socketId) {
        for (const [slot, player] of this.players.entries()) {
            if (player.socketId !== socketId)
                continue;
            if (this.phase === 'waiting' || this.pendingStart) {
                this.players.delete(slot);
                this.timer.clear();
                this.clearPlanningGraceTimeout();
                this.clearNextRoundTimeout();
                this.readySockets.clear();
                this.pendingStart = false;
                this.touchActivity();
                return;
            }
            player.connected = false;
            player.hp = 0;
            player.pathSubmitted = true;
            player.plannedPath = [];
            this.readySockets.delete(socketId);
            this.touchActivity();
            const result = this.getDisconnectWinner();
            if (result) {
                this.timer.clear();
                this.clearPlanningGraceTimeout();
                this.clearNextRoundTimeout();
                this.pendingStart = false;
                this.phase = 'gameover';
                this.gameResult = result;
                if (result !== 'draw' && !this.rewardsGranted) {
                    this.rewardsGranted = true;
                    void (0, playerAuth_1.grantDailyRewardTokens)([...this.players.values()]
                        .filter((entry) => entry.team === result)
                        .map((entry) => entry.userId), 6);
                    void (0, achievementService_1.recordMatchPlayed)({
                        userIds: [...this.players.values()].map((entry) => entry.userId),
                        matchType: 'twovtwo',
                    });
                    void Promise.all([...this.players.values()]
                        .filter((entry) => entry.team === result)
                        .map((entry) => (0, achievementService_1.recordModeWin)({ userId: entry.userId, mode: 'twovtwo' })));
                }
                this.io.to(this.roomId).emit('twovtwo_game_over', {
                    result,
                    message: 'A team disconnected.',
                });
                return;
            }
            this.io.to(this.roomId).emit('twovtwo_player_disconnected', {
                slot,
                state: this.toClientState(),
            });
            if (this.phase === 'planning' && this.allAlivePlayersSubmitted()) {
                this.timer.clear();
                this.clearPlanningGraceTimeout();
                this.resolveRound();
            }
            return;
        }
    }
    updatePlayerSkin(socketId, pieceSkin) {
        const player = this.getPlayerBySocket(socketId);
        if (!player)
            return;
        player.pieceSkin = pieceSkin;
        this.touchActivity();
        this.io.to(this.roomId).emit('player_skin_updated', {
            slot: player.slot,
            pieceSkin,
        });
    }
    prepareGameStart() {
        this.pendingStart = true;
        this.readySockets.clear();
        this.touchActivity();
    }
    markClientReady(socketId) {
        if (!this.pendingStart)
            return false;
        const player = this.getPlayerBySocket(socketId);
        if (!player)
            return false;
        this.readySockets.add(socketId);
        this.touchActivity();
        const allReady = this.players.size === 4 &&
            [...this.players.values()].every((entry) => entry.connected && this.readySockets.has(entry.socketId));
        if (!allReady)
            return false;
        this.startGame();
        return true;
    }
    startGame() {
        this.pendingStart = false;
        this.readySockets.clear();
        this.rematchSet.clear();
        this.rematchQueuedTeams.clear();
        this.gameResult = null;
        this.rewardsGranted = false;
        this.turn = 1;
        this.attackerTeam = 'red';
        this.phase = 'planning';
        this.resetPlayers();
        this.updateRoles();
        this.obstacles = (0, TwoVsTwoEngine_1.generateTwoVsTwoObstacles)(this.roomId, this.turn, this.getActivePositions());
        this.touchActivity();
        const gameStartState = this.toClientState();
        this.io.to(this.roomId).emit('twovtwo_game_start', gameStartState);
        this.emitRoundStart();
    }
    updatePlannedPath(socketId, path) {
        if (this.phase !== 'planning')
            return;
        const player = this.getPlayerBySocket(socketId);
        if (!player || !player.connected || player.pathSubmitted || player.hp <= 0)
            return;
        const maxPoints = (0, TwoVsTwoEngine_1.calcTwoVsTwoPathPoints)(this.turn);
        if (!(0, TwoVsTwoEngine_1.isValidTwoVsTwoPath)(player.position, path, maxPoints, this.obstacles))
            return;
        player.plannedPath = path;
        this.touchActivity();
        this.io.to(this.roomId).emit('twovtwo_path_updated', {
            slot: player.slot,
            team: player.team,
            path,
        });
    }
    submitPath(socketId, path) {
        if (this.phase !== 'planning')
            return { ok: false, acceptedPath: [] };
        const player = this.getPlayerBySocket(socketId);
        if (!player || !player.connected || player.pathSubmitted || player.hp <= 0) {
            return { ok: false, acceptedPath: [] };
        }
        const maxPoints = (0, TwoVsTwoEngine_1.calcTwoVsTwoPathPoints)(this.turn);
        player.plannedPath = (0, TwoVsTwoEngine_1.isValidTwoVsTwoPath)(player.position, path, maxPoints, this.obstacles)
            ? path
            : (0, TwoVsTwoEngine_1.isValidTwoVsTwoPath)(player.position, player.plannedPath, maxPoints, this.obstacles)
                ? player.plannedPath
                : [];
        player.pathSubmitted = true;
        this.touchActivity();
        this.io.to(this.roomId).emit('twovtwo_player_submitted', {
            slot: player.slot,
            team: player.team,
            path: player.plannedPath,
        });
        if (this.allAlivePlayersSubmitted()) {
            this.timer.clear();
            this.resolveRound();
        }
        return { ok: true, acceptedPath: player.plannedPath };
    }
    requestRematch(socketId) {
        if (this.phase !== 'gameover')
            return { status: 'ignored' };
        if (this.rematchSet.has(socketId))
            return { status: 'ignored' };
        const player = this.getPlayerBySocket(socketId);
        if (!player)
            return { status: 'ignored' };
        this.rematchSet.add(socketId);
        this.touchActivity();
        const team = player.team;
        const teamPlayers = [...this.players.values()].filter((entry) => entry.team === team);
        const teammate = teamPlayers.find((entry) => entry.socketId !== socketId) ?? null;
        const teamReady = teamPlayers.every((entry) => this.rematchSet.has(entry.socketId));
        if (!teamReady) {
            return {
                status: 'waiting_teammate',
                teammateSocketId: teammate?.socketId ?? null,
                team,
            };
        }
        if (this.rematchQueuedTeams.has(team)) {
            return { status: 'ignored' };
        }
        this.rematchQueuedTeams.add(team);
        return {
            status: 'team_ready',
            team,
            members: teamPlayers.map((entry) => ({
                socketId: entry.socketId,
                nickname: entry.nickname,
                userId: entry.userId,
                stats: entry.stats,
                pieceSkin: entry.pieceSkin,
                slot: entry.slot,
            })),
        };
    }
    sendChat(socketId, message) {
        const player = this.getPlayerBySocket(socketId);
        if (!player)
            return;
        this.touchActivity();
        this.io.to(this.roomId).emit('chat_receive', {
            sender: player.nickname,
            color: player.team,
            message: message.slice(0, 200),
            timestamp: Date.now(),
        });
    }
    getSocketIds() {
        return [...this.players.values()]
            .filter((player) => player.connected)
            .map((player) => player.socketId);
    }
    toClientState() {
        const players = Object.fromEntries(TwoVsTwoEngine_1.TWO_VS_TWO_SLOTS.map((slot) => [slot, this.toClientPlayer(this.players.get(slot))]));
        return {
            roomId: this.roomId,
            code: this.code,
            turn: this.turn,
            phase: this.phase,
            pathPoints: (0, TwoVsTwoEngine_1.calcTwoVsTwoPathPoints)(this.turn),
            obstacles: this.obstacles.map((obstacle) => ({ ...obstacle })),
            attackerTeam: this.attackerTeam,
            players,
            gameResult: this.gameResult,
        };
    }
    emitRoundStart() {
        if (this.players.size < 4)
            return;
        this.phase = 'planning';
        this.updateRoles();
        this.obstacles = (0, TwoVsTwoEngine_1.generateTwoVsTwoObstacles)(this.roomId, this.turn, this.getActivePositions());
        for (const player of this.players.values()) {
            player.pathSubmitted = !player.connected || player.hp <= 0;
            player.plannedPath = [];
        }
        const now = Date.now();
        this.touchActivity(now);
        const state = this.toClientState();
        const payload = {
            state,
            timeLimit: 7,
            serverTime: now,
            roundEndsAt: now + PLANNING_TIME_MS,
        };
        this.io.to(this.roomId).emit('twovtwo_round_start', payload);
        this.timer.start(PLANNING_TIME_MS, () => this.onPlanningTimeout());
    }
    onPlanningTimeout() {
        if (this.phase !== 'planning')
            return;
        this.clearPlanningGraceTimeout();
        this.planningGraceTimeout = setTimeout(() => {
            this.planningGraceTimeout = null;
            if (this.phase !== 'planning')
                return;
            const maxPoints = (0, TwoVsTwoEngine_1.calcTwoVsTwoPathPoints)(this.turn);
            for (const player of this.players.values()) {
                if (!player.connected || player.pathSubmitted || player.hp <= 0)
                    continue;
                player.plannedPath = (0, TwoVsTwoEngine_1.isValidTwoVsTwoPath)(player.position, player.plannedPath, maxPoints, this.obstacles)
                    ? player.plannedPath
                    : [];
                player.pathSubmitted = true;
            }
            this.resolveRound();
        }, SUBMIT_GRACE_MS);
    }
    resolveRound() {
        if (this.players.size < 4)
            return;
        const starts = this.getPositions();
        const paths = Object.fromEntries(TwoVsTwoEngine_1.TWO_VS_TWO_SLOTS.map((slot) => {
            const player = this.players.get(slot);
            return [slot, player.hp > 0 ? [...player.plannedPath] : []];
        }));
        const hps = Object.fromEntries(TwoVsTwoEngine_1.TWO_VS_TWO_SLOTS.map((slot) => [slot, this.players.get(slot).hp]));
        this.phase = 'moving';
        const resolution = (0, TwoVsTwoEngine_1.resolveTwoVsTwoMovement)({
            starts,
            paths,
            hps,
            attackerTeam: this.attackerTeam,
        });
        const payload = {
            starts,
            paths,
            playerHits: resolution.playerHits,
        };
        this.touchActivity();
        this.io.to(this.roomId).emit('twovtwo_resolution', payload);
        this.clearNextRoundTimeout();
        const maxSteps = Math.max(...TwoVsTwoEngine_1.TWO_VS_TWO_SLOTS.map((slot) => paths[slot].length + 1), 1);
        const animTime = calcAnimationDuration(maxSteps);
        this.nextRoundTimeout = setTimeout(() => {
            this.nextRoundTimeout = null;
            for (const slot of TwoVsTwoEngine_1.TWO_VS_TWO_SLOTS) {
                const player = this.players.get(slot);
                if (player.connected) {
                    player.position = resolution.ends[slot];
                }
                player.hp = resolution.hps[slot];
                player.pathSubmitted = false;
                player.plannedPath = [];
            }
            const redAlive = ((this.players.get('red_top')?.connected ?? false) &&
                (this.players.get('red_top')?.hp ?? 0) > 0) ||
                ((this.players.get('red_bottom')?.connected ?? false) &&
                    (this.players.get('red_bottom')?.hp ?? 0) > 0);
            const blueAlive = ((this.players.get('blue_top')?.connected ?? false) &&
                (this.players.get('blue_top')?.hp ?? 0) > 0) ||
                ((this.players.get('blue_bottom')?.connected ?? false) &&
                    (this.players.get('blue_bottom')?.hp ?? 0) > 0);
            if (!redAlive && !blueAlive) {
                this.phase = 'gameover';
                this.gameResult = 'draw';
                this.touchActivity();
                void (0, achievementService_1.recordMatchPlayed)({
                    userIds: [...this.players.values()].map((player) => player.userId),
                    matchType: 'twovtwo',
                });
                this.io.to(this.roomId).emit('twovtwo_game_over', { result: 'draw' });
                return;
            }
            if (!redAlive || !blueAlive) {
                this.phase = 'gameover';
                this.gameResult = redAlive ? 'red' : 'blue';
                this.touchActivity();
                void (0, achievementService_1.recordMatchPlayed)({
                    userIds: [...this.players.values()].map((player) => player.userId),
                    matchType: 'twovtwo',
                });
                if (!this.rewardsGranted) {
                    this.rewardsGranted = true;
                    void (0, playerAuth_1.grantDailyRewardTokens)([...this.players.values()]
                        .filter((entry) => entry.team === this.gameResult)
                        .map((entry) => entry.userId), 6);
                    void Promise.all([...this.players.values()]
                        .filter((entry) => entry.team === this.gameResult)
                        .map((entry) => (0, achievementService_1.recordModeWin)({ userId: entry.userId, mode: 'twovtwo' })));
                }
                this.io.to(this.roomId).emit('twovtwo_game_over', { result: this.gameResult });
                return;
            }
            this.turn += 1;
            this.attackerTeam = this.attackerTeam === 'red' ? 'blue' : 'red';
            this.emitRoundStart();
        }, animTime);
    }
    getPositions() {
        return Object.fromEntries(TwoVsTwoEngine_1.TWO_VS_TWO_SLOTS.map((slot) => [slot, { ...this.players.get(slot).position }]));
    }
    getActivePositions() {
        return Object.fromEntries(TwoVsTwoEngine_1.TWO_VS_TWO_SLOTS.filter((slot) => {
            const player = this.players.get(slot);
            return player?.connected && (player.hp ?? 0) > 0;
        }).map((slot) => [slot, { ...this.players.get(slot).position }]));
    }
    getPlayerBySocket(socketId) {
        return [...this.players.values()].find((player) => player.socketId === socketId);
    }
    toClientPlayer(player) {
        return {
            id: player.id,
            nickname: player.nickname,
            color: player.team,
            slot: player.slot,
            team: player.team,
            connected: player.connected,
            pieceSkin: player.pieceSkin,
            hp: player.hp,
            position: { ...player.position },
            pathSubmitted: player.pathSubmitted,
            role: player.role,
            stats: player.stats,
        };
    }
    resetPlayers() {
        const positions = (0, TwoVsTwoEngine_1.getTwoVsTwoInitialPositions)();
        for (const slot of TwoVsTwoEngine_1.TWO_VS_TWO_SLOTS) {
            const player = this.players.get(slot);
            if (!player)
                continue;
            player.hp = 3;
            player.position = { ...positions[slot] };
            player.pathSubmitted = false;
            player.plannedPath = [];
            player.connected = true;
        }
    }
    updateRoles() {
        for (const player of this.players.values()) {
            player.role = player.team === this.attackerTeam ? 'attacker' : 'escaper';
        }
    }
    allAlivePlayersSubmitted() {
        return [...this.players.values()].every((player) => !player.connected || player.hp <= 0 || player.pathSubmitted);
    }
    getDisconnectWinner() {
        const redConnected = [...this.players.values()].some((player) => player.team === 'red' && player.connected);
        const blueConnected = [...this.players.values()].some((player) => player.team === 'blue' && player.connected);
        if (!redConnected && !blueConnected)
            return 'draw';
        if (!redConnected)
            return 'blue';
        if (!blueConnected)
            return 'red';
        return null;
    }
    clearPlanningGraceTimeout() {
        if (this.planningGraceTimeout) {
            clearTimeout(this.planningGraceTimeout);
            this.planningGraceTimeout = null;
        }
    }
    clearNextRoundTimeout() {
        if (this.nextRoundTimeout) {
            clearTimeout(this.nextRoundTimeout);
            this.nextRoundTimeout = null;
        }
    }
    touchActivity(now = Date.now()) {
        this.lastActivityAt = now;
    }
}
exports.TwoVsTwoRoom = TwoVsTwoRoom;
