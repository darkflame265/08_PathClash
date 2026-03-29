"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameRoom = void 0;
const GameEngine_1 = require("./GameEngine");
const AiPlanner_1 = require("./AiPlanner");
const ServerTimer_1 = require("./ServerTimer");
const playerAuth_1 = require("../services/playerAuth");
const PLANNING_TIME_MS = 7000;
const SUBMIT_GRACE_MS = 350;
class GameRoom {
    constructor(roomId, code, io, matchType) {
        this.createdAt = Date.now();
        this.lastActivityAt = Date.now();
        this.players = new Map();
        this.phase = 'waiting';
        this.turn = 1;
        this.attackerColor = 'red';
        this.obstacles = [];
        this.timer = new ServerTimer_1.ServerTimer();
        this.rematchSet = new Set();
        this.readySockets = new Set();
        this.aiColor = null;
        this.pendingStart = false;
        this.pendingStartPaused = false;
        this.planningGraceTimeout = null;
        this.movingCompleteTimeout = null;
        this.nextRoundTimeout = null;
        this.roomId = roomId;
        this.code = code;
        this.io = io;
        this.matchType = matchType;
    }
    get playerCount() { return this.players.size; }
    get isFull() { return this.players.size === 2; }
    get currentPhase() { return this.phase; }
    get createdTimestamp() { return this.createdAt; }
    get lastActivityTimestamp() { return this.lastActivityAt; }
    addPlayer(socket, nickname, userId = null, stats = { wins: 0, losses: 0 }, pieceSkin = 'classic') {
        if (this.isFull)
            return null;
        const color = this.players.size === 0 ? 'red' : 'blue';
        const player = this.createPlayerState(color, socket.id, nickname, userId, stats, pieceSkin);
        this.players.set(color, player);
        socket.join(this.roomId);
        this.touchActivity();
        return color;
    }
    addAiPlayer(nickname = 'AI Bot') {
        if (this.isFull)
            return null;
        const color = this.players.size === 0 ? 'red' : 'blue';
        const aiId = `ai_${this.roomId}_${color}`;
        const player = this.createPlayerState(color, aiId, nickname, null, { wins: 0, losses: 0 }, 'classic');
        this.players.set(color, player);
        this.aiColor = color;
        this.touchActivity();
        return color;
    }
    updatePlayerSkin(socketId, pieceSkin) {
        const player = this.getPlayerBySocket(socketId);
        if (!player)
            return;
        player.pieceSkin = pieceSkin;
        this.touchActivity();
        this.io.to(this.roomId).emit('player_skin_updated', {
            color: player.color,
            pieceSkin,
        });
    }
    removePlayer(socketId) {
        let disconnectedColor = null;
        let shouldAwardDisconnectResult = false;
        let winnerColor = null;
        for (const [color, p] of this.players) {
            if (p.socketId === socketId) {
                const wasActiveMatch = this.phase === 'planning' || this.phase === 'moving';
                disconnectedColor = color;
                this.players.delete(color);
                if (this.aiColor === color)
                    this.aiColor = null;
                this.timer.clear();
                this.clearPendingTimeouts();
                this.readySockets.clear();
                this.pendingStart = false;
                this.pendingStartPaused = false;
                if (this.matchType === 'random' &&
                    !this.aiColor &&
                    wasActiveMatch &&
                    this.players.size === 1) {
                    winnerColor = [...this.players.keys()][0] ?? null;
                    shouldAwardDisconnectResult = winnerColor !== null;
                    if (winnerColor) {
                        this.phase = 'gameover';
                    }
                }
                this.touchActivity();
                break;
            }
        }
        return {
            disconnectedColor,
            shouldAwardDisconnectResult,
            winnerColor,
        };
    }
    hasHumanPlayers() {
        return [...this.players.values()].some((player) => player.color !== this.aiColor);
    }
    // ─── Game flow ─────────────────────────────────────────────────────────────
    startGame(startPaused = false) {
        this.pendingStart = false;
        this.pendingStartPaused = false;
        this.readySockets.clear();
        this.phase = startPaused ? 'waiting' : 'planning';
        this.turn = 1;
        this.attackerColor = 'red';
        this.resetPositions();
        this.updateRoles();
        this.touchActivity();
        const gameStartState = this.toClientState();
        this.io.to(this.roomId).emit('game_start', gameStartState);
        if (startPaused)
            return;
        this.startRound();
    }
    resumeTutorial(socketId) {
        if (this.matchType !== 'ai')
            return;
        if (this.phase !== 'waiting')
            return;
        const player = this.getPlayerBySocket(socketId);
        if (!player || player.color === this.aiColor)
            return;
        this.touchActivity();
        this.startRound();
    }
    prepareGameStart(startPaused = false) {
        this.pendingStart = true;
        this.pendingStartPaused = startPaused;
        this.readySockets.clear();
        this.touchActivity();
    }
    markClientReady(socketId) {
        if (!this.pendingStart)
            return false;
        const player = this.getPlayerBySocket(socketId);
        if (!player || player.color === this.aiColor)
            return false;
        this.readySockets.add(socketId);
        this.touchActivity();
        const humanSocketIds = [...this.players.values()]
            .filter((entry) => entry.color !== this.aiColor)
            .map((entry) => entry.socketId);
        const allHumansReady = humanSocketIds.length > 0 &&
            humanSocketIds.every((humanSocketId) => this.readySockets.has(humanSocketId));
        if (!allHumansReady)
            return false;
        this.startGame(this.pendingStartPaused);
        return true;
    }
    startRound() {
        if (!this.hasBothPlayers())
            return;
        this.phase = 'planning';
        const red = this.players.get('red');
        const blue = this.players.get('blue');
        if (!red || !blue)
            return;
        red.plannedPath = [];
        red.pathSubmitted = false;
        blue.plannedPath = [];
        blue.pathSubmitted = false;
        this.obstacles = (0, GameEngine_1.generateObstacles)(this.roomId, this.turn, red.position, blue.position);
        const now = Date.now();
        this.touchActivity(now);
        const payload = {
            turn: this.turn,
            pathPoints: (0, GameEngine_1.calcPathPoints)(this.turn),
            attackerColor: this.attackerColor,
            redPosition: red.position,
            bluePosition: blue.position,
            obstacles: this.obstacles,
            timeLimit: 7,
            serverTime: now,
            roundEndsAt: now + PLANNING_TIME_MS,
        };
        this.io.to(this.roomId).emit('round_start', payload);
        this.timer.start(PLANNING_TIME_MS, () => this.onPlanningTimeout());
    }
    onPlanningTimeout() {
        if (!this.hasBothPlayers())
            return;
        this.touchActivity();
        this.submitAiPath();
        // Give the timer-end submission a brief grace window to arrive.
        this.clearPlanningGraceTimeout();
        this.planningGraceTimeout = setTimeout(() => {
            this.planningGraceTimeout = null;
            if (this.phase !== 'planning')
                return;
            if (!this.hasBothPlayers())
                return;
            for (const [, p] of this.players) {
                if (!p.pathSubmitted) {
                    const maxPoints = (0, GameEngine_1.calcPathPoints)(this.turn);
                    if (!(0, GameEngine_1.isValidPath)(p.position, p.plannedPath, maxPoints, this.obstacles)) {
                        p.plannedPath = [];
                    }
                    p.pathSubmitted = true;
                }
            }
            this.revealPaths();
        }, SUBMIT_GRACE_MS);
    }
    updatePlannedPath(socketId, path) {
        if (this.phase !== 'planning')
            return;
        const player = this.getPlayerBySocket(socketId);
        if (!player || player.pathSubmitted)
            return;
        const maxPoints = (0, GameEngine_1.calcPathPoints)(this.turn);
        if (!(0, GameEngine_1.isValidPath)(player.position, path, maxPoints, this.obstacles))
            return;
        player.plannedPath = path;
        this.touchActivity();
    }
    submitPath(socketId, path) {
        if (this.phase !== 'planning')
            return false;
        const player = this.getPlayerBySocket(socketId);
        if (!player || player.pathSubmitted)
            return false;
        const maxPoints = (0, GameEngine_1.calcPathPoints)(this.turn);
        if ((0, GameEngine_1.isValidPath)(player.position, path, maxPoints, this.obstacles)) {
            // Invalid path — treat as empty
            player.plannedPath = path;
        }
        else if (!(0, GameEngine_1.isValidPath)(player.position, player.plannedPath, maxPoints, this.obstacles)) {
            player.plannedPath = [];
        }
        player.pathSubmitted = true;
        this.touchActivity();
        // Notify opponent
        this.emitToOpponent(socketId, 'opponent_submitted', {});
        // Both submitted → reveal
        const allSubmitted = [...this.players.values()].every(p => p.pathSubmitted);
        if (allSubmitted) {
            this.timer.clear();
            this.revealPaths();
        }
        return true;
    }
    revealPaths() {
        if (this.phase !== 'planning')
            return;
        if (!this.hasBothPlayers())
            return;
        const red = this.players.get('red');
        const blue = this.players.get('blue');
        if (!red || !blue)
            return;
        this.phase = 'moving';
        this.touchActivity();
        const escaper = this.attackerColor === 'red' ? blue : red;
        const collisions = (0, GameEngine_1.detectCollisions)(red.plannedPath, blue.plannedPath, red.position, blue.position, this.attackerColor, escaper.hp);
        const payload = {
            redPath: red.plannedPath,
            bluePath: blue.plannedPath,
            redStart: { ...red.position },
            blueStart: { ...blue.position },
            collisions,
        };
        this.io.to(this.roomId).emit('paths_reveal', payload);
        // Apply collision HP changes
        if (collisions.length > 0) {
            const lastCollision = collisions[collisions.length - 1];
            escaper.hp = lastCollision.newHp;
        }
        // Advance positions to end of paths
        if (red.plannedPath.length > 0)
            red.position = red.plannedPath[red.plannedPath.length - 1];
        if (blue.plannedPath.length > 0)
            blue.position = blue.plannedPath[blue.plannedPath.length - 1];
        // Wait for animation to finish
        const animTime = (0, GameEngine_1.calcAnimationDuration)(Math.max(red.plannedPath.length, blue.plannedPath.length));
        this.clearMovingCompleteTimeout();
        this.movingCompleteTimeout = setTimeout(() => {
            this.movingCompleteTimeout = null;
            this.onMovingComplete();
        }, animTime);
    }
    onMovingComplete() {
        if (this.phase !== 'moving')
            return;
        if (!this.hasBothPlayers())
            return;
        const red = this.players.get('red');
        const blue = this.players.get('blue');
        if (!red || !blue)
            return;
        // Check game over
        if (red.hp <= 0 || blue.hp <= 0) {
            this.phase = 'gameover';
            const winner = red.hp > 0 ? 'red' : 'blue';
            const loser = winner === 'red' ? 'blue' : 'red';
            if (this.matchType === 'random' && !this.aiColor) {
                this.players.get(winner).stats.wins++;
                this.players.get(loser).stats.losses++;
                void (0, playerAuth_1.recordMatchmakingResult)(this.players.get(winner).userId, this.players.get(loser).userId);
            }
            this.touchActivity();
            this.io.to(this.roomId).emit('game_over', { winner });
            return;
        }
        // Next round
        this.turn++;
        this.attackerColor = this.attackerColor === 'red' ? 'blue' : 'red';
        this.updateRoles();
        this.touchActivity();
        this.io.to(this.roomId).emit('round_end', {
            redPosition: red.position,
            bluePosition: blue.position,
            newTurn: this.turn,
        });
        this.clearNextRoundTimeout();
        this.nextRoundTimeout = setTimeout(() => {
            this.nextRoundTimeout = null;
            this.startRound();
        }, 500);
    }
    // ─── Rematch ────────────────────────────────────────────────────────────────
    requestRematch(socketId) {
        if (this.phase !== 'gameover')
            return;
        if (this.aiColor) {
            this.rematchSet.clear();
            this.resetGame();
            this.startGame();
            return;
        }
        if (this.rematchSet.has(socketId))
            return;
        this.rematchSet.add(socketId);
        this.touchActivity();
        if (this.rematchSet.size === 1) {
            this.emitToOpponent(socketId, 'rematch_requested', {});
        }
        else {
            // Both agreed
            this.rematchSet.clear();
            this.resetGame();
            this.startGame();
        }
    }
    // ─── Chat ────────────────────────────────────────────────────────────────────
    sendChat(socketId, message) {
        const player = this.getPlayerBySocket(socketId);
        if (!player)
            return;
        const trimmed = message.slice(0, 200);
        this.touchActivity();
        this.io.to(this.roomId).emit('chat_receive', {
            sender: player.nickname,
            color: player.color,
            message: trimmed,
            timestamp: Date.now(),
        });
    }
    // ─── Helpers ─────────────────────────────────────────────────────────────────
    resetGame() {
        this.timer.clear();
        this.clearPendingTimeouts();
        this.turn = 1;
        this.attackerColor = 'red';
        this.phase = 'waiting';
        this.obstacles = [];
        this.resetPositions();
        for (const p of this.players.values()) {
            p.hp = 3;
            p.plannedPath = [];
            p.pathSubmitted = false;
        }
        this.updateRoles();
        this.readySockets.clear();
        this.pendingStart = false;
        this.pendingStartPaused = false;
    }
    resetPositions() {
        const pos = (0, GameEngine_1.getInitialPositions)();
        const red = this.players.get('red');
        const blue = this.players.get('blue');
        if (red)
            red.position = { ...pos.red };
        if (blue)
            blue.position = { ...pos.blue };
    }
    updateRoles() {
        for (const [color, p] of this.players) {
            p.role = color === this.attackerColor ? 'attacker' : 'escaper';
        }
    }
    getPlayerBySocket(socketId) {
        for (const p of this.players.values()) {
            if (p.socketId === socketId)
                return p;
        }
        return undefined;
    }
    emitToOpponent(socketId, event, data) {
        for (const p of this.players.values()) {
            if (p.socketId !== socketId) {
                if (p.color === this.aiColor)
                    return;
                this.io.to(p.socketId).emit(event, data);
                return;
            }
        }
    }
    toClientState() {
        const red = this.players.get('red');
        const blue = this.players.get('blue');
        return {
            roomId: this.roomId,
            code: this.code,
            turn: this.turn,
            phase: this.phase,
            pathPoints: (0, GameEngine_1.calcPathPoints)(this.turn),
            obstacles: this.obstacles,
            players: {
                red: (0, GameEngine_1.toClientPlayer)(red),
                blue: (0, GameEngine_1.toClientPlayer)(blue),
            },
            attackerColor: this.attackerColor,
        };
    }
    getPlayerColor(socketId) {
        return this.getPlayerBySocket(socketId)?.color;
    }
    getPlayerByColor(color) {
        return this.players.get(color);
    }
    getSocketIds() {
        return [...this.players.values()].map((player) => player.socketId);
    }
    createPlayerState(color, id, nickname, userId, stats, pieceSkin) {
        const pos = (0, GameEngine_1.getInitialPositions)();
        return {
            id: userId ?? id,
            userId,
            socketId: id,
            nickname,
            color,
            pieceSkin,
            hp: 3,
            position: pos[color],
            plannedPath: [],
            pathSubmitted: false,
            role: color === 'red' ? 'attacker' : 'escaper',
            stats,
        };
    }
    submitAiPath() {
        if (!this.aiColor || this.phase !== 'planning')
            return;
        const aiPlayer = this.players.get(this.aiColor);
        if (!aiPlayer || aiPlayer.pathSubmitted)
            return;
        const opponentColor = this.aiColor === 'red' ? 'blue' : 'red';
        const opponent = this.players.get(opponentColor);
        if (!opponent)
            return;
        aiPlayer.plannedPath = (0, AiPlanner_1.createAiPath)({
            color: aiPlayer.color,
            role: aiPlayer.role,
            selfPosition: aiPlayer.position,
            opponentPosition: opponent.position,
            pathPoints: (0, GameEngine_1.calcPathPoints)(this.turn),
            obstacles: this.obstacles,
        });
        aiPlayer.pathSubmitted = true;
        this.touchActivity();
    }
    touchActivity(timestamp = Date.now()) {
        this.lastActivityAt = timestamp;
    }
    hasBothPlayers() {
        return this.players.has('red') && this.players.has('blue');
    }
    clearPlanningGraceTimeout() {
        if (this.planningGraceTimeout) {
            clearTimeout(this.planningGraceTimeout);
            this.planningGraceTimeout = null;
        }
    }
    clearMovingCompleteTimeout() {
        if (this.movingCompleteTimeout) {
            clearTimeout(this.movingCompleteTimeout);
            this.movingCompleteTimeout = null;
        }
    }
    clearNextRoundTimeout() {
        if (this.nextRoundTimeout) {
            clearTimeout(this.nextRoundTimeout);
            this.nextRoundTimeout = null;
        }
    }
    clearPendingTimeouts() {
        this.clearPlanningGraceTimeout();
        this.clearMovingCompleteTimeout();
        this.clearNextRoundTimeout();
    }
}
exports.GameRoom = GameRoom;
