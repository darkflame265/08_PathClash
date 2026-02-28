"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameRoom = void 0;
const GameEngine_1 = require("./GameEngine");
const AiPlanner_1 = require("./AiPlanner");
const ServerTimer_1 = require("./ServerTimer");
const PLANNING_TIME_MS = 10000;
const SUBMIT_GRACE_MS = 350;
class GameRoom {
    constructor(roomId, code, io) {
        this.players = new Map();
        this.phase = 'waiting';
        this.turn = 1;
        this.attackerColor = 'red';
        this.obstacles = [];
        this.timer = new ServerTimer_1.ServerTimer();
        this.rematchSet = new Set();
        this.aiColor = null;
        this.roomId = roomId;
        this.code = code;
        this.io = io;
    }
    get playerCount() { return this.players.size; }
    get isFull() { return this.players.size === 2; }
    addPlayer(socket, nickname) {
        if (this.isFull)
            return null;
        const color = this.players.size === 0 ? 'red' : 'blue';
        const player = this.createPlayerState(color, socket.id, nickname);
        this.players.set(color, player);
        socket.join(this.roomId);
        return color;
    }
    addAiPlayer(nickname = 'AI Bot') {
        if (this.isFull)
            return null;
        const color = this.players.size === 0 ? 'red' : 'blue';
        const aiId = `ai_${this.roomId}_${color}`;
        const player = this.createPlayerState(color, aiId, nickname);
        this.players.set(color, player);
        this.aiColor = color;
        return color;
    }
    removePlayer(socketId) {
        for (const [color, p] of this.players) {
            if (p.socketId === socketId) {
                this.players.delete(color);
                if (this.aiColor === color)
                    this.aiColor = null;
                this.timer.clear();
                break;
            }
        }
    }
    hasHumanPlayers() {
        return [...this.players.values()].some((player) => player.color !== this.aiColor);
    }
    // ─── Game flow ─────────────────────────────────────────────────────────────
    startGame() {
        this.phase = 'planning';
        this.turn = 1;
        this.attackerColor = 'red';
        this.resetPositions();
        this.updateRoles();
        this.io.to(this.roomId).emit('game_start', this.toClientState());
        this.startRound();
    }
    startRound() {
        this.phase = 'planning';
        const red = this.players.get('red');
        const blue = this.players.get('blue');
        red.plannedPath = [];
        red.pathSubmitted = false;
        blue.plannedPath = [];
        blue.pathSubmitted = false;
        this.obstacles = (0, GameEngine_1.generateObstacles)(red.position, blue.position);
        const payload = {
            turn: this.turn,
            pathPoints: (0, GameEngine_1.calcPathPoints)(this.turn),
            attackerColor: this.attackerColor,
            redPosition: red.position,
            bluePosition: blue.position,
            obstacles: this.obstacles,
            timeLimit: 10,
            serverTime: Date.now(),
        };
        this.io.to(this.roomId).emit('round_start', payload);
        this.timer.start(PLANNING_TIME_MS, () => this.onPlanningTimeout());
    }
    onPlanningTimeout() {
        this.submitAiPath();
        // Give the timer-end submission a brief grace window to arrive.
        setTimeout(() => {
            if (this.phase !== 'planning')
                return;
            for (const [, p] of this.players) {
                if (!p.pathSubmitted) {
                    p.plannedPath = [];
                    p.pathSubmitted = true;
                }
            }
            this.revealPaths();
        }, SUBMIT_GRACE_MS);
    }
    submitPath(socketId, path) {
        if (this.phase !== 'planning')
            return;
        const player = this.getPlayerBySocket(socketId);
        if (!player || player.pathSubmitted)
            return;
        const maxPoints = (0, GameEngine_1.calcPathPoints)(this.turn);
        if (!(0, GameEngine_1.isValidPath)(player.position, path, maxPoints, this.obstacles)) {
            // Invalid path — treat as empty
            player.plannedPath = [];
        }
        else {
            player.plannedPath = path;
        }
        player.pathSubmitted = true;
        // Notify opponent
        this.emitToOpponent(socketId, 'opponent_submitted', {});
        // Both submitted → reveal
        const allSubmitted = [...this.players.values()].every(p => p.pathSubmitted);
        if (allSubmitted) {
            this.timer.clear();
            this.revealPaths();
        }
    }
    revealPaths() {
        if (this.phase !== 'planning')
            return;
        this.phase = 'moving';
        const red = this.players.get('red');
        const blue = this.players.get('blue');
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
        setTimeout(() => this.onMovingComplete(), animTime);
    }
    onMovingComplete() {
        const red = this.players.get('red');
        const blue = this.players.get('blue');
        // Check game over
        if (red.hp <= 0 || blue.hp <= 0) {
            this.phase = 'gameover';
            const winner = red.hp > 0 ? 'red' : 'blue';
            const loser = winner === 'red' ? 'blue' : 'red';
            this.players.get(winner).stats.wins++;
            this.players.get(loser).stats.losses++;
            this.io.to(this.roomId).emit('game_over', { winner });
            return;
        }
        // Next round
        this.turn++;
        this.attackerColor = this.attackerColor === 'red' ? 'blue' : 'red';
        this.updateRoles();
        this.io.to(this.roomId).emit('round_end', {
            redPosition: red.position,
            bluePosition: blue.position,
            newTurn: this.turn,
        });
        setTimeout(() => this.startRound(), 500);
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
        this.io.to(this.roomId).emit('chat_receive', {
            sender: player.nickname,
            color: player.color,
            message: trimmed,
            timestamp: Date.now(),
        });
    }
    // ─── Helpers ─────────────────────────────────────────────────────────────────
    resetGame() {
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
    createPlayerState(color, id, nickname) {
        const pos = (0, GameEngine_1.getInitialPositions)();
        return {
            id,
            socketId: id,
            nickname,
            color,
            hp: 3,
            position: pos[color],
            plannedPath: [],
            pathSubmitted: false,
            role: color === 'red' ? 'attacker' : 'escaper',
            stats: { wins: 0, losses: 0 },
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
    }
}
exports.GameRoom = GameRoom;
