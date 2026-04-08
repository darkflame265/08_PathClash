"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GameRoom = void 0;
const GameEngine_1 = require("./GameEngine");
const AiPlanner_1 = require("./AiPlanner");
const ServerTimer_1 = require("./ServerTimer");
const playerAuth_1 = require("../services/playerAuth");
const achievementService_1 = require("../services/achievementService");
const PLANNING_TIME_MS = 7000;
const SUBMIT_GRACE_MS = 350;
function getTutorialAttackerColor(scenario, humanColor, aiColor) {
    return scenario === "escape" || scenario === "overlap_escape"
        ? aiColor
        : humanColor;
}
class GameRoom {
    constructor(roomId, code, io, matchType) {
        this.createdAt = Date.now();
        this.lastActivityAt = Date.now();
        this.players = new Map();
        this.phase = "waiting";
        this.turn = 1;
        this.attackerColor = "red";
        this.obstacles = [];
        this.timer = new ServerTimer_1.ServerTimer();
        this.rematchSet = new Set();
        this.readySockets = new Set();
        this.aiColor = null;
        this.pendingStart = false;
        this.pendingStartPaused = false;
        this.tutorialActive = false;
        this.tutorialScenario = "attack";
        this.planningGraceTimeout = null;
        this.movingCompleteTimeout = null;
        this.nextRoundTimeout = null;
        this.roomId = roomId;
        this.code = code;
        this.io = io;
        this.matchType = matchType;
    }
    get playerCount() {
        return this.players.size;
    }
    get isFull() {
        return this.players.size === 2;
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
    addPlayer(socket, nickname, userId = null, stats = { wins: 0, losses: 0 }, pieceSkin = "classic", boardSkin = "classic") {
        if (this.isFull)
            return null;
        const color = this.players.size === 0 ? "red" : "blue";
        const player = this.createPlayerState(color, socket.id, nickname, userId, stats, pieceSkin, boardSkin);
        this.players.set(color, player);
        socket.join(this.roomId);
        this.touchActivity();
        return color;
    }
    addAiPlayer(nickname = "AI Bot") {
        if (this.isFull)
            return null;
        const color = this.players.size === 0 ? "red" : "blue";
        const aiId = `ai_${this.roomId}_${color}`;
        const player = this.createPlayerState(color, aiId, nickname, null, { wins: 0, losses: 0 }, "classic", "classic");
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
        this.io.to(this.roomId).emit("player_skin_updated", {
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
                disconnectedColor = color;
                const wasActiveMatch = this.phase === "planning" || this.phase === "moving";
                if (wasActiveMatch) {
                    p.connected = false;
                    p.pathSubmitted = true;
                    p.plannedPath = [];
                    this.readySockets.delete(socketId);
                    this.touchActivity();
                    if (this.phase === "planning") {
                        const allSubmitted = [...this.players.values()].every((player) => player.pathSubmitted);
                        if (allSubmitted) {
                            this.timer.clear();
                            this.clearPlanningGraceTimeout();
                            this.revealPaths();
                        }
                    }
                    break;
                }
                this.players.delete(color);
                if (this.aiColor === color)
                    this.aiColor = null;
                this.timer.clear();
                this.clearPendingTimeouts();
                this.readySockets.clear();
                this.pendingStart = false;
                this.pendingStartPaused = false;
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
        this.tutorialActive = startPaused && this.matchType === "ai";
        this.tutorialScenario = "attack";
        this.readySockets.clear();
        this.phase = startPaused ? "waiting" : "planning";
        this.turn = 1;
        this.attackerColor = "red";
        this.resetPositions();
        this.updateRoles();
        this.touchActivity();
        const gameStartState = this.toClientState();
        this.io.to(this.roomId).emit("game_start", gameStartState);
        if (startPaused)
            return;
        this.startRound();
    }
    resumeTutorial(socketId) {
        if (this.matchType !== "ai")
            return;
        if (this.phase !== "waiting")
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
        this.phase = "planning";
        const red = this.players.get("red");
        const blue = this.players.get("blue");
        if (!red || !blue)
            return;
        if (this.tutorialActive && this.aiColor) {
            const humanColor = this.aiColor === "red" ? "blue" : "red";
            const human = this.players.get(humanColor);
            const ai = this.players.get(this.aiColor);
            if (human && ai) {
                applyTutorialScenarioLayout(human, ai, this.tutorialScenario);
                this.attackerColor = getTutorialAttackerColor(this.tutorialScenario, humanColor, this.aiColor);
                this.updateRoles();
            }
        }
        red.plannedPath = [];
        red.pathSubmitted = false;
        blue.plannedPath = [];
        blue.pathSubmitted = false;
        if (red.connected === false) {
            red.pathSubmitted = true;
        }
        if (blue.connected === false) {
            blue.pathSubmitted = true;
        }
        this.obstacles = this.tutorialActive
            ? getTutorialObstacles(this.tutorialScenario)
            : (0, GameEngine_1.generateObstacles)(this.roomId, this.turn, red.position, blue.position);
        const now = Date.now();
        this.touchActivity(now);
        const timeLimitSeconds = this.tutorialActive ? 0 : 7;
        const pathPoints = this.currentPathPoints();
        const payload = {
            turn: this.turn,
            pathPoints,
            attackerColor: this.attackerColor,
            redPosition: red.position,
            bluePosition: blue.position,
            obstacles: this.obstacles,
            timeLimit: timeLimitSeconds,
            serverTime: now,
            roundEndsAt: now + (this.tutorialActive ? 0 : PLANNING_TIME_MS),
            tutorialScenario: this.tutorialActive ? this.tutorialScenario : undefined,
        };
        if (this.tutorialActive) {
            this.io.to(this.roomId).emit("game_start", this.toClientState());
        }
        this.io.to(this.roomId).emit("round_start", payload);
        if (this.tutorialActive) {
            this.submitAiPath();
            return;
        }
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
            if (this.phase !== "planning")
                return;
            if (!this.hasBothPlayers())
                return;
            for (const [, p] of this.players) {
                if (!p.pathSubmitted) {
                    const maxPoints = this.currentPathPoints();
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
        if (this.phase !== "planning")
            return;
        const player = this.getPlayerBySocket(socketId);
        if (!player || player.pathSubmitted)
            return;
        const maxPoints = this.currentPathPoints();
        if (!(0, GameEngine_1.isValidPath)(player.position, path, maxPoints, this.obstacles))
            return;
        player.plannedPath = path;
        this.touchActivity();
    }
    submitPath(socketId, path) {
        if (this.phase !== "planning")
            return false;
        const player = this.getPlayerBySocket(socketId);
        if (!player || player.pathSubmitted)
            return false;
        const maxPoints = this.currentPathPoints();
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
        this.emitToOpponent(socketId, "opponent_submitted", {});
        // Both submitted → reveal
        const allSubmitted = [...this.players.values()].every((p) => p.pathSubmitted);
        if (allSubmitted) {
            this.timer.clear();
            this.revealPaths();
        }
        return true;
    }
    revealPaths() {
        if (this.phase !== "planning")
            return;
        if (!this.hasBothPlayers())
            return;
        const red = this.players.get("red");
        const blue = this.players.get("blue");
        if (!red || !blue)
            return;
        this.phase = "moving";
        this.touchActivity();
        const escaper = this.attackerColor === "red" ? blue : red;
        const collisions = (0, GameEngine_1.detectCollisions)(red.plannedPath, blue.plannedPath, red.position, blue.position, this.attackerColor, escaper.hp);
        const payload = {
            redPath: red.plannedPath,
            bluePath: blue.plannedPath,
            redStart: { ...red.position },
            blueStart: { ...blue.position },
            collisions,
        };
        this.io.to(this.roomId).emit("paths_reveal", payload);
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
        if (this.phase !== "moving")
            return;
        if (!this.hasBothPlayers())
            return;
        const red = this.players.get("red");
        const blue = this.players.get("blue");
        if (!red || !blue)
            return;
        if (this.tutorialActive && this.aiColor && red.hp > 0 && blue.hp > 0) {
            const humanColor = this.aiColor === "red" ? "blue" : "red";
            const human = this.players.get(humanColor);
            const ai = this.players.get(this.aiColor);
            if (!human || !ai)
                return;
            if (this.tutorialScenario === "attack" && ai.hp < 3) {
                const initial = (0, GameEngine_1.getInitialPositions)();
                human.position = { ...initial[human.color] };
                ai.position = { ...initial[ai.color] };
                human.plannedPath = [];
                ai.plannedPath = [];
                human.pathSubmitted = false;
                ai.pathSubmitted = false;
                human.hp = 3;
                ai.hp = 3;
                this.turn = 1;
                this.attackerColor = this.aiColor;
                this.tutorialScenario = "escape";
                this.updateRoles();
                this.touchActivity();
                this.clearNextRoundTimeout();
                this.nextRoundTimeout = setTimeout(() => {
                    this.nextRoundTimeout = null;
                    this.startRound();
                }, 500);
                return;
            }
            if (this.tutorialScenario === "attack") {
                const initial = (0, GameEngine_1.getInitialPositions)();
                human.position = { ...initial[human.color] };
                ai.position = { ...initial[ai.color] };
                human.plannedPath = [];
                ai.plannedPath = [];
                human.pathSubmitted = false;
                ai.pathSubmitted = false;
                human.hp = 3;
                ai.hp = 3;
                this.turn = 1;
                this.attackerColor = humanColor;
                this.tutorialScenario = "attack";
                this.updateRoles();
                this.touchActivity();
                this.clearNextRoundTimeout();
                this.nextRoundTimeout = setTimeout(() => {
                    this.nextRoundTimeout = null;
                    this.startRound();
                }, 500);
                return;
            }
            if (this.tutorialScenario === "escape") {
                const humanWasHit = human.hp < 3;
                const initial = (0, GameEngine_1.getInitialPositions)();
                human.position = { ...initial[human.color] };
                ai.position = { ...initial[ai.color] };
                human.plannedPath = [];
                ai.plannedPath = [];
                human.pathSubmitted = false;
                ai.pathSubmitted = false;
                human.hp = 3;
                ai.hp = 3;
                if (humanWasHit) {
                    this.attackerColor = this.aiColor;
                    this.tutorialScenario = "escape";
                }
                else {
                    this.attackerColor = humanColor;
                    this.tutorialScenario = "predict";
                }
                this.updateRoles();
                this.touchActivity();
                this.clearNextRoundTimeout();
                this.nextRoundTimeout = setTimeout(() => {
                    this.nextRoundTimeout = null;
                    this.startRound();
                }, 500);
                return;
            }
            if (this.tutorialScenario === "predict") {
                const aiWasHit = ai.hp < 3;
                const initial = (0, GameEngine_1.getInitialPositions)();
                human.position = { ...initial[human.color] };
                ai.position = { ...initial[ai.color] };
                human.plannedPath = [];
                ai.plannedPath = [];
                human.pathSubmitted = false;
                ai.pathSubmitted = false;
                human.hp = 3;
                ai.hp = 3;
                this.turn = 1;
                this.attackerColor = humanColor;
                this.tutorialScenario = aiWasHit ? "predict_obstacle" : "predict";
                this.updateRoles();
                this.touchActivity();
                this.clearNextRoundTimeout();
                this.nextRoundTimeout = setTimeout(() => {
                    this.nextRoundTimeout = null;
                    this.startRound();
                }, 500);
                return;
            }
            if (this.tutorialScenario === "predict_obstacle") {
                const aiWasHit = ai.hp < 3;
                applyTutorialScenarioLayout(human, ai, "predict_obstacle");
                human.plannedPath = [];
                ai.plannedPath = [];
                human.pathSubmitted = false;
                ai.pathSubmitted = false;
                human.hp = 3;
                ai.hp = 3;
                this.turn = 1;
                this.attackerColor = humanColor;
                this.tutorialScenario = aiWasHit ? "predict_wall" : "predict_obstacle";
                this.updateRoles();
                this.touchActivity();
                this.clearNextRoundTimeout();
                this.nextRoundTimeout = setTimeout(() => {
                    this.nextRoundTimeout = null;
                    this.startRound();
                }, 500);
                return;
            }
            if (this.tutorialScenario === "predict_wall") {
                const aiWasHit = ai.hp < 3;
                applyTutorialScenarioLayout(human, ai, "predict_wall");
                human.plannedPath = [];
                ai.plannedPath = [];
                human.pathSubmitted = false;
                ai.pathSubmitted = false;
                human.hp = 3;
                ai.hp = 3;
                this.turn = 1;
                this.tutorialScenario = aiWasHit ? "overlap_escape" : "predict_wall";
                this.attackerColor = getTutorialAttackerColor(this.tutorialScenario, humanColor, this.aiColor);
                this.updateRoles();
                this.touchActivity();
                this.clearNextRoundTimeout();
                this.nextRoundTimeout = setTimeout(() => {
                    this.nextRoundTimeout = null;
                    this.startRound();
                }, 500);
                return;
            }
            if (this.tutorialScenario === "overlap_escape") {
                const tookOrDealtDamage = human.hp < 3 || ai.hp < 3;
                const escapedSuccessfully = !tookOrDealtDamage;
                applyTutorialScenarioLayout(human, ai, "overlap_escape");
                human.plannedPath = [];
                ai.plannedPath = [];
                human.pathSubmitted = false;
                ai.pathSubmitted = false;
                human.hp = 3;
                ai.hp = 3;
                this.turn = 1;
                this.tutorialScenario = escapedSuccessfully ? "chain_attack" : "overlap_escape";
                this.attackerColor = getTutorialAttackerColor(this.tutorialScenario, humanColor, this.aiColor);
                this.updateRoles();
                this.touchActivity();
                this.clearNextRoundTimeout();
                this.nextRoundTimeout = setTimeout(() => {
                    this.nextRoundTimeout = null;
                    this.startRound();
                }, 500);
                return;
            }
            if (this.tutorialScenario === "chain_attack") {
                const aiDiedInOneRound = ai.hp <= 0;
                applyTutorialScenarioLayout(human, ai, "chain_attack");
                human.plannedPath = [];
                ai.plannedPath = [];
                human.pathSubmitted = false;
                ai.pathSubmitted = false;
                human.hp = 3;
                ai.hp = 3;
                this.turn = 1;
                this.tutorialScenario = aiDiedInOneRound ? "freeplay" : "chain_attack";
                this.attackerColor = getTutorialAttackerColor(this.tutorialScenario, humanColor, this.aiColor);
                this.updateRoles();
                this.touchActivity();
                this.clearNextRoundTimeout();
                this.nextRoundTimeout = setTimeout(() => {
                    this.nextRoundTimeout = null;
                    this.startRound();
                }, 500);
                return;
            }
            if (this.tutorialScenario === "freeplay") {
                const initial = (0, GameEngine_1.getInitialPositions)();
                human.position = { ...initial[human.color] };
                ai.position = { ...initial[ai.color] };
                human.plannedPath = [];
                ai.plannedPath = [];
                human.pathSubmitted = false;
                ai.pathSubmitted = false;
                human.hp = 3;
                this.turn = 1;
                this.attackerColor = humanColor;
                this.tutorialScenario = "freeplay";
                this.updateRoles();
                this.touchActivity();
                this.clearNextRoundTimeout();
                this.nextRoundTimeout = setTimeout(() => {
                    this.nextRoundTimeout = null;
                    this.startRound();
                }, 500);
                return;
            }
        }
        // Check game over
        if (red.hp <= 0 || blue.hp <= 0) {
            this.phase = "gameover";
            const winner = red.hp > 0 ? "red" : "blue";
            const loser = winner === "red" ? "blue" : "red";
            const winnerUserId = this.players.get(winner)?.userId ?? null;
            const loserUserId = this.players.get(loser)?.userId ?? null;
            if (this.matchType === "random" && !this.aiColor) {
                this.players.get(winner).stats.wins++;
                this.players.get(loser).stats.losses++;
                void (0, playerAuth_1.recordMatchmakingResult)(winnerUserId, loserUserId);
                void (0, achievementService_1.recordMatchPlayed)({
                    userIds: [winnerUserId, loserUserId],
                    matchType: "duel",
                });
                void (0, achievementService_1.recordModeWin)({ userId: winnerUserId, mode: "duel" });
            }
            else if (this.matchType === "ai" && !this.tutorialActive) {
                const humanUserIds = [...this.players.values()]
                    .filter((player) => player.color !== this.aiColor)
                    .map((player) => player.userId);
                void (0, achievementService_1.recordMatchPlayed)({
                    userIds: humanUserIds,
                    matchType: "ai",
                });
                if (winner !== this.aiColor) {
                    void (0, achievementService_1.recordModeWin)({ userId: winnerUserId, mode: "ai" });
                }
            }
            else if (this.matchType === "ai" && this.tutorialActive && winner !== this.aiColor) {
                void (0, achievementService_1.markTutorialComplete)(winnerUserId);
            }
            this.touchActivity();
            this.io.to(this.roomId).emit("game_over", { winner });
            return;
        }
        // Next round
        this.turn++;
        this.attackerColor = this.attackerColor === "red" ? "blue" : "red";
        this.updateRoles();
        this.touchActivity();
        this.io.to(this.roomId).emit("round_end", {
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
        if (this.phase !== "gameover")
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
            this.emitToOpponent(socketId, "rematch_requested", {});
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
        this.io.to(this.roomId).emit("chat_receive", {
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
        this.attackerColor = "red";
        this.phase = "waiting";
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
        this.tutorialActive = false;
        this.tutorialScenario = "attack";
    }
    resetPositions() {
        const pos = (0, GameEngine_1.getInitialPositions)();
        const red = this.players.get("red");
        const blue = this.players.get("blue");
        if (red)
            red.position = { ...pos.red };
        if (blue)
            blue.position = { ...pos.blue };
    }
    updateRoles() {
        for (const [color, p] of this.players) {
            p.role = color === this.attackerColor ? "attacker" : "escaper";
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
        const red = this.players.get("red");
        const blue = this.players.get("blue");
        return {
            roomId: this.roomId,
            code: this.code,
            turn: this.turn,
            phase: this.phase,
            pathPoints: this.currentPathPoints(),
            obstacles: this.obstacles,
            tutorialActive: this.tutorialActive,
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
    createPlayerState(color, id, nickname, userId, stats, pieceSkin, boardSkin) {
        const pos = (0, GameEngine_1.getInitialPositions)();
        return {
            id: userId ?? id,
            userId,
            socketId: id,
            nickname,
            color,
            connected: true,
            pieceSkin,
            boardSkin,
            hp: 3,
            position: pos[color],
            plannedPath: [],
            pathSubmitted: false,
            role: color === "red" ? "attacker" : "escaper",
            stats,
        };
    }
    currentPathPoints() {
        const hasDisconnectedHuman = [...this.players.values()].some((player) => player.connected === false && player.color !== this.aiColor);
        return hasDisconnectedHuman ? 30 : (0, GameEngine_1.calcPathPoints)(this.turn);
    }
    submitAiPath() {
        if (!this.aiColor || this.phase !== "planning")
            return;
        const aiPlayer = this.players.get(this.aiColor);
        if (!aiPlayer || aiPlayer.pathSubmitted)
            return;
        const opponentColor = this.aiColor === "red" ? "blue" : "red";
        const opponent = this.players.get(opponentColor);
        if (!opponent)
            return;
        if (this.tutorialActive) {
            if (this.tutorialScenario === "attack" ||
                this.tutorialScenario === "freeplay") {
                aiPlayer.plannedPath = [];
                aiPlayer.pathSubmitted = true;
                this.touchActivity();
                return;
            }
            if (this.tutorialScenario === "predict") {
                aiPlayer.plannedPath =
                    aiPlayer.color === "blue"
                        ? [
                            {
                                row: Math.min(4, aiPlayer.position.row + 1),
                                col: aiPlayer.position.col,
                            },
                            {
                                row: Math.min(4, aiPlayer.position.row + 2),
                                col: aiPlayer.position.col,
                            },
                            {
                                row: Math.min(4, aiPlayer.position.row + 2),
                                col: Math.max(0, aiPlayer.position.col - 1),
                            },
                            {
                                row: Math.min(4, aiPlayer.position.row + 2),
                                col: Math.max(0, aiPlayer.position.col - 2),
                            },
                        ]
                        : [
                            {
                                row: Math.min(4, aiPlayer.position.row + 1),
                                col: aiPlayer.position.col,
                            },
                            {
                                row: Math.min(4, aiPlayer.position.row + 2),
                                col: aiPlayer.position.col,
                            },
                            {
                                row: Math.min(4, aiPlayer.position.row + 2),
                                col: Math.min(4, aiPlayer.position.col + 1),
                            },
                            {
                                row: Math.min(4, aiPlayer.position.row + 2),
                                col: Math.min(4, aiPlayer.position.col + 2),
                            },
                        ];
                aiPlayer.pathSubmitted = true;
                this.touchActivity();
                return;
            }
            if (this.tutorialScenario === "predict_obstacle") {
                aiPlayer.plannedPath =
                    aiPlayer.color === "blue"
                        ? [
                            {
                                row: aiPlayer.position.row,
                                col: Math.max(0, aiPlayer.position.col - 1),
                            },
                            {
                                row: aiPlayer.position.row,
                                col: Math.max(0, aiPlayer.position.col - 2),
                            },
                            {
                                row: Math.min(4, aiPlayer.position.row + 1),
                                col: Math.max(0, aiPlayer.position.col - 2),
                            },
                            {
                                row: Math.min(4, aiPlayer.position.row + 2),
                                col: Math.max(0, aiPlayer.position.col - 2),
                            },
                        ]
                        : [
                            {
                                row: aiPlayer.position.row,
                                col: Math.min(4, aiPlayer.position.col + 1),
                            },
                            {
                                row: aiPlayer.position.row,
                                col: Math.min(4, aiPlayer.position.col + 2),
                            },
                            {
                                row: Math.min(4, aiPlayer.position.row + 1),
                                col: Math.min(4, aiPlayer.position.col + 2),
                            },
                            {
                                row: Math.min(4, aiPlayer.position.row + 2),
                                col: Math.min(4, aiPlayer.position.col + 2),
                            },
                        ];
                aiPlayer.pathSubmitted = true;
                this.touchActivity();
                return;
            }
            if (this.tutorialScenario === "predict_wall") {
                aiPlayer.plannedPath =
                    aiPlayer.color === "blue"
                        ? [
                            {
                                row: Math.min(4, aiPlayer.position.row + 1),
                                col: aiPlayer.position.col,
                            },
                            {
                                row: Math.min(4, aiPlayer.position.row + 2),
                                col: aiPlayer.position.col,
                            },
                        ]
                        : [
                            {
                                row: Math.min(4, aiPlayer.position.row + 1),
                                col: aiPlayer.position.col,
                            },
                            {
                                row: Math.min(4, aiPlayer.position.row + 2),
                                col: aiPlayer.position.col,
                            },
                        ];
                aiPlayer.pathSubmitted = true;
                this.touchActivity();
                return;
            }
            if (this.tutorialScenario === "overlap_escape") {
                aiPlayer.plannedPath =
                    aiPlayer.color === "blue"
                        ? [
                            {
                                row: aiPlayer.position.row,
                                col: Math.max(0, aiPlayer.position.col - 1),
                            },
                        ]
                        : [
                            {
                                row: aiPlayer.position.row,
                                col: Math.min(4, aiPlayer.position.col + 1),
                            },
                        ];
                aiPlayer.pathSubmitted = true;
                this.touchActivity();
                return;
            }
            if (this.tutorialScenario === "chain_attack") {
                aiPlayer.plannedPath =
                    aiPlayer.color === "blue"
                        ? [
                            { row: aiPlayer.position.row, col: Math.max(0, aiPlayer.position.col - 1) },
                            { row: aiPlayer.position.row, col: Math.max(0, aiPlayer.position.col - 2) },
                            { row: Math.min(4, aiPlayer.position.row + 1), col: Math.max(0, aiPlayer.position.col - 2) },
                            { row: Math.min(4, aiPlayer.position.row + 1), col: Math.max(0, aiPlayer.position.col - 3) },
                            { row: Math.min(4, aiPlayer.position.row + 2), col: Math.max(0, aiPlayer.position.col - 3) },
                        ]
                        : [
                            { row: aiPlayer.position.row, col: Math.min(4, aiPlayer.position.col + 1) },
                            { row: aiPlayer.position.row, col: Math.min(4, aiPlayer.position.col + 2) },
                            { row: Math.min(4, aiPlayer.position.row + 1), col: Math.min(4, aiPlayer.position.col + 2) },
                            { row: Math.min(4, aiPlayer.position.row + 1), col: Math.min(4, aiPlayer.position.col + 3) },
                            { row: Math.min(4, aiPlayer.position.row + 2), col: Math.min(4, aiPlayer.position.col + 3) },
                        ];
                aiPlayer.pathSubmitted = true;
                this.touchActivity();
                return;
            }
            const initial = (0, GameEngine_1.getInitialPositions)();
            const escapeTarget = initial[opponentColor];
            aiPlayer.plannedPath = buildTutorialAiPath(aiPlayer.position, escapeTarget);
            aiPlayer.pathSubmitted = true;
            this.touchActivity();
            return;
        }
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
        return this.players.has("red") && this.players.has("blue");
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
function buildTutorialAiPath(start, end) {
    const path = [];
    let row = start.row;
    let col = start.col;
    while (row !== end.row) {
        row += row < end.row ? 1 : -1;
        path.push({ row, col });
    }
    while (col !== end.col) {
        col += col < end.col ? 1 : -1;
        path.push({ row, col });
    }
    return path;
}
function getTutorialObstacles(scenario) {
    if (scenario === "predict_obstacle") {
        return [{ row: 1, col: 3 }];
    }
    if (scenario === "predict_wall") {
        return [
            { row: 3, col: 3 },
            { row: 4, col: 3 },
        ];
    }
    if (scenario === "overlap_escape") {
        return [
            { row: 2, col: 4 },
            { row: 3, col: 3 },
            { row: 4, col: 2 },
        ];
    }
    if (scenario === "chain_attack") {
        return [];
    }
    return [];
}
function applyTutorialScenarioLayout(human, ai, scenario) {
    const initial = (0, GameEngine_1.getInitialPositions)();
    if (scenario === "predict_obstacle") {
        human.position = { row: 2, col: 2 };
        ai.position = ai.color === "blue" ? { row: 0, col: 4 } : { row: 0, col: 0 };
        return;
    }
    if (scenario === "predict_wall") {
        human.position = { row: 2, col: 2 };
        ai.position = ai.color === "blue" ? { row: 2, col: 4 } : { row: 2, col: 0 };
        return;
    }
    if (scenario === "overlap_escape") {
        human.position =
            ai.color === "blue" ? { row: 4, col: 4 } : { row: 4, col: 0 };
        ai.position = { ...human.position };
        return;
    }
    if (scenario === "chain_attack") {
        if (ai.color === "blue") {
            human.position = { row: 1, col: 3 };
            ai.position = { row: 0, col: 4 };
        }
        else {
            human.position = { row: 1, col: 1 };
            ai.position = { row: 0, col: 0 };
        }
        return;
    }
    human.position = { ...initial[human.color] };
    ai.position = { ...initial[ai.color] };
}
