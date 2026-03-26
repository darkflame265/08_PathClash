"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbilityRoom = void 0;
const GameEngine_1 = require("../GameEngine");
const ServerTimer_1 = require("../ServerTimer");
const playerAuth_1 = require("../../services/playerAuth");
const AbilityEngine_1 = require("./AbilityEngine");
const PLANNING_TIME_MS = 7000;
const SUBMIT_GRACE_MS = 350;
const INITIAL_MANA = 4;
const MAX_MANA = 10;
const MANA_PER_TURN = 2;
const SKILL_EVENT_BUFFER_MS = 1100;
const OVERDRIVE_MANA = 20;
function posEqual(a, b) {
    return a.row === b.row && a.col === b.col;
}
function buildBlitzPath(start, target) {
    const rowDelta = target.row - start.row;
    const colDelta = target.col - start.col;
    const rowStep = rowDelta === 0 ? 0 : rowDelta > 0 ? 1 : -1;
    const colStep = colDelta === 0 ? 0 : colDelta > 0 ? 1 : -1;
    if (Math.abs(rowDelta) + Math.abs(colDelta) !== 1)
        return [];
    const path = [];
    let row = start.row + rowStep;
    let col = start.col + colStep;
    while (row >= 0 && row <= 4 && col >= 0 && col <= 4) {
        path.push({ row, col });
        row += rowStep;
        col += colStep;
    }
    return path;
}
const SKILL_COSTS = {
    classic_guard: 4,
    ember_blast: 4,
    inferno_field: 4,
    nova_blast: 4,
    aurora_heal: 10,
    gold_overdrive: 8,
    quantum_shift: 3,
    plasma_charge: 2,
    void_cloak: 8,
    electric_blitz: 6,
    cosmic_bigbang: 10,
};
function getRandomTeleportPosition(current, opponent) {
    const candidates = [];
    for (let row = 0; row < 5; row++) {
        for (let col = 0; col < 5; col++) {
            if (row === opponent.row && col === opponent.col)
                continue;
            candidates.push({ row, col });
        }
    }
    const filtered = candidates.filter((position) => !posEqual(position, current));
    const pool = filtered.length > 0 ? filtered : candidates;
    return pool[Math.floor(Math.random() * pool.length)];
}
class AbilityRoom {
    constructor(roomId, code, io) {
        this.timer = new ServerTimer_1.ServerTimer();
        this.createdAt = Date.now();
        this.lastActivityAt = Date.now();
        this.players = new Map();
        this.phase = 'waiting';
        this.turn = 1;
        this.attackerColor = 'red';
        this.obstacles = [];
        this.lavaTiles = [];
        this.readySockets = new Set();
        this.pendingStart = false;
        this.pendingStartPaused = false;
        this.rematchSet = new Set();
        this.planningGraceTimeout = null;
        this.movingCompleteTimeout = null;
        this.nextRoundTimeout = null;
        this.rewardsGranted = false;
        this.roomId = roomId;
        this.code = code;
        this.io = io;
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
    getSocketIds() {
        return [...this.players.values()].map((player) => player.socketId);
    }
    addPlayer(socket, nickname, userId, stats, pieceSkin, equippedSkills) {
        if (this.isFull)
            return null;
        const color = this.players.size === 0 ? 'red' : 'blue';
        const initialPositions = (0, GameEngine_1.getInitialPositions)();
        this.players.set(color, {
            id: userId ?? socket.id,
            userId,
            socketId: socket.id,
            nickname,
            color,
            pieceSkin,
            hp: 3,
            position: { ...initialPositions[color] },
            plannedPath: [],
            plannedSkills: [],
            pathSubmitted: false,
            role: color === 'red' ? 'attacker' : 'escaper',
            stats,
            mana: INITIAL_MANA,
            invulnerableSteps: 0,
            pendingManaBonus: 0,
            pendingOverdriveStage: 0,
            pendingVoidCloak: false,
            overdriveActive: false,
            reboundLocked: false,
            hidden: false,
            equippedSkills,
        });
        socket.join(this.roomId);
        this.touchActivity();
        return color;
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
        if (!player)
            return false;
        this.readySockets.add(socketId);
        this.touchActivity();
        const humanSocketIds = [...this.players.values()].map((entry) => entry.socketId);
        const allReady = humanSocketIds.length === 2 && humanSocketIds.every((id) => this.readySockets.has(id));
        if (!allReady)
            return false;
        this.startGame(this.pendingStartPaused);
        return true;
    }
    startGame(startPaused = false) {
        this.pendingStart = false;
        this.pendingStartPaused = false;
        this.readySockets.clear();
        this.phase = startPaused ? 'waiting' : 'planning';
        this.turn = 1;
        this.attackerColor = 'red';
        this.rewardsGranted = false;
        this.resetPlayers();
        this.updateRoles();
        this.touchActivity();
        this.io.to(this.roomId).emit('ability_game_start', this.toClientState());
        if (!startPaused)
            this.startRound();
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
    updatePlan(socketId, path, skills) {
        if (this.phase !== 'planning')
            return null;
        const player = this.getPlayerBySocket(socketId);
        if (!player || player.pathSubmitted)
            return null;
        const validated = this.validatePlan(player, path, skills);
        if (!validated)
            return null;
        player.plannedPath = validated.path;
        player.plannedSkills = validated.skills;
        this.touchActivity();
        this.io.to(this.roomId).emit('ability_plan_updated', {
            color: player.color,
            path: validated.path,
            skills: validated.skills,
        });
        return {
            acceptedPath: validated.path,
            acceptedSkills: validated.skills,
        };
    }
    submitPlan(socketId, path, skills) {
        if (this.phase !== 'planning')
            return { ok: false, acceptedPath: [], acceptedSkills: [] };
        const player = this.getPlayerBySocket(socketId);
        if (!player || player.pathSubmitted)
            return { ok: false, acceptedPath: [], acceptedSkills: [] };
        const validated = this.validatePlan(player, path, skills) ?? this.validatePlan(player, player.plannedPath, player.plannedSkills) ?? { path: [], skills: [] };
        player.plannedPath = validated.path;
        player.plannedSkills = validated.skills;
        player.pathSubmitted = true;
        this.touchActivity();
        this.emitToOpponent(socketId, 'ability_opponent_submitted', {});
        this.io.to(this.roomId).emit('ability_player_submitted', {
            color: player.color,
            path: validated.path,
            skills: validated.skills,
        });
        const allSubmitted = [...this.players.values()].every((entry) => entry.pathSubmitted);
        if (allSubmitted) {
            this.timer.clear();
            this.revealPlans();
        }
        return { ok: true, acceptedPath: validated.path, acceptedSkills: validated.skills };
    }
    requestRematch(socketId) {
        if (this.phase !== 'gameover')
            return;
        if (this.rematchSet.has(socketId))
            return;
        this.rematchSet.add(socketId);
        this.touchActivity();
        if (this.rematchSet.size === 1) {
            this.emitToOpponent(socketId, 'rematch_requested', {});
            return;
        }
        this.rematchSet.clear();
        this.resetGame();
        this.startGame();
    }
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
    removePlayer(socketId) {
        let disconnectedColor = null;
        let shouldAwardDisconnectResult = false;
        let winnerColor = null;
        for (const [color, player] of this.players.entries()) {
            if (player.socketId !== socketId)
                continue;
            disconnectedColor = color;
            this.players.delete(color);
            this.timer.clear();
            this.clearPendingTimeouts();
            this.readySockets.clear();
            this.pendingStart = false;
            this.pendingStartPaused = false;
            const wasActive = this.phase === 'planning' || this.phase === 'moving';
            if (wasActive && this.players.size === 1) {
                winnerColor = [...this.players.keys()][0] ?? null;
                shouldAwardDisconnectResult = winnerColor !== null;
                if (winnerColor)
                    this.phase = 'gameover';
            }
            this.touchActivity();
            break;
        }
        return { disconnectedColor, shouldAwardDisconnectResult, winnerColor };
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
            lavaTiles: this.lavaTiles,
            players: {
                red: this.toClientPlayer(red),
                blue: this.toClientPlayer(blue),
            },
            attackerColor: this.attackerColor,
        };
    }
    getPlayerByColor(color) {
        return this.players.get(color);
    }
    startRound() {
        if (!this.hasBothPlayers())
            return;
        this.phase = 'planning';
        const red = this.players.get('red');
        const blue = this.players.get('blue');
        if (!red || !blue)
            return;
        red.pathSubmitted = false;
        blue.pathSubmitted = false;
        red.plannedPath = [];
        blue.plannedPath = [];
        red.plannedSkills = [];
        blue.plannedSkills = [];
        red.hidden = false;
        blue.hidden = false;
        red.overdriveActive = false;
        blue.overdriveActive = false;
        red.reboundLocked = false;
        blue.reboundLocked = false;
        red.mana = Math.min(MAX_MANA, red.mana + MANA_PER_TURN);
        blue.mana = Math.min(MAX_MANA, blue.mana + MANA_PER_TURN);
        red.mana = Math.min(MAX_MANA, red.mana + red.pendingManaBonus);
        blue.mana = Math.min(MAX_MANA, blue.mana + blue.pendingManaBonus);
        red.pendingManaBonus = 0;
        blue.pendingManaBonus = 0;
        if (red.pendingOverdriveStage === 1) {
            red.mana = OVERDRIVE_MANA;
            red.overdriveActive = true;
            red.pendingOverdriveStage = 2;
        }
        else if (red.pendingOverdriveStage === 2) {
            red.mana = 0;
            red.reboundLocked = true;
            red.pendingOverdriveStage = 0;
        }
        if (blue.pendingOverdriveStage === 1) {
            blue.mana = OVERDRIVE_MANA;
            blue.overdriveActive = true;
            blue.pendingOverdriveStage = 2;
        }
        else if (blue.pendingOverdriveStage === 2) {
            blue.mana = 0;
            blue.reboundLocked = true;
            blue.pendingOverdriveStage = 0;
        }
        if (red.pendingVoidCloak) {
            red.position = getRandomTeleportPosition(red.position, blue.position);
            red.hidden = true;
            red.pendingVoidCloak = false;
        }
        if (blue.pendingVoidCloak) {
            blue.position = getRandomTeleportPosition(blue.position, red.position);
            blue.hidden = true;
            blue.pendingVoidCloak = false;
        }
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
            lavaTiles: this.lavaTiles,
            timeLimit: 7,
            serverTime: now,
            roundEndsAt: now + PLANNING_TIME_MS,
            state: this.toClientState(),
        };
        this.io.to(this.roomId).emit('ability_round_start', payload);
        this.timer.start(PLANNING_TIME_MS, () => this.onPlanningTimeout());
    }
    onPlanningTimeout() {
        if (!this.hasBothPlayers())
            return;
        this.clearPlanningGraceTimeout();
        this.planningGraceTimeout = setTimeout(() => {
            this.planningGraceTimeout = null;
            if (this.phase !== 'planning')
                return;
            for (const player of this.players.values()) {
                if (!player.pathSubmitted) {
                    player.pathSubmitted = true;
                }
            }
            this.revealPlans();
        }, SUBMIT_GRACE_MS);
    }
    revealPlans() {
        if (this.phase !== 'planning' || !this.hasBothPlayers())
            return;
        this.phase = 'moving';
        const red = this.players.get('red');
        const blue = this.players.get('blue');
        if (!red || !blue)
            return;
        red.hidden = false;
        blue.hidden = false;
        const resolution = (0, AbilityEngine_1.resolveAbilityRound)({
            red,
            blue,
            attackerColor: this.attackerColor,
            obstacles: this.obstacles,
            lavaTiles: this.lavaTiles,
        });
        red.position = resolution.redState.position;
        red.hp = resolution.redState.hp;
        red.mana = resolution.redState.mana;
        red.invulnerableSteps = resolution.redState.invulnerableSteps;
        red.pendingManaBonus = resolution.redState.pendingManaBonus;
        red.pendingOverdriveStage = resolution.redState.pendingOverdriveStage;
        red.pendingVoidCloak = resolution.redState.pendingVoidCloak;
        red.overdriveActive = resolution.redState.overdriveActive;
        red.reboundLocked = resolution.redState.reboundLocked;
        blue.position = resolution.blueState.position;
        blue.hp = resolution.blueState.hp;
        blue.mana = resolution.blueState.mana;
        blue.invulnerableSteps = resolution.blueState.invulnerableSteps;
        blue.pendingManaBonus = resolution.blueState.pendingManaBonus;
        blue.pendingOverdriveStage = resolution.blueState.pendingOverdriveStage;
        blue.pendingVoidCloak = resolution.blueState.pendingVoidCloak;
        blue.overdriveActive = resolution.blueState.overdriveActive;
        blue.reboundLocked = resolution.blueState.reboundLocked;
        this.lavaTiles = resolution.lavaTiles;
        this.touchActivity();
        this.io.to(this.roomId).emit('ability_resolution', resolution.payload);
        const animTime = (0, GameEngine_1.calcAnimationDuration)(Math.max(red.plannedPath.length, blue.plannedPath.length) + resolution.payload.skillEvents.length) + resolution.payload.skillEvents.length * SKILL_EVENT_BUFFER_MS;
        this.clearMovingCompleteTimeout();
        this.movingCompleteTimeout = setTimeout(() => {
            this.movingCompleteTimeout = null;
            this.onMovingComplete(resolution.winner);
        }, animTime);
    }
    onMovingComplete(winner) {
        if (this.phase !== 'moving')
            return;
        if (!this.hasBothPlayers())
            return;
        if (winner) {
            this.phase = 'gameover';
            if (winner !== 'draw' && !this.rewardsGranted) {
                const loserColor = winner === 'red' ? 'blue' : 'red';
                this.players.get(winner).stats.wins += 1;
                this.players.get(loserColor).stats.losses += 1;
                void (0, playerAuth_1.recordMatchmakingResult)(this.players.get(winner)?.userId ?? null, this.players.get(loserColor)?.userId ?? null);
                void Promise.all([
                    (0, playerAuth_1.grantDailyRewardTokens)([this.players.get(winner)?.userId ?? null], 6),
                ]);
                this.rewardsGranted = true;
            }
            this.touchActivity();
            this.io.to(this.roomId).emit('ability_game_over', { winner });
            return;
        }
        for (const player of this.players.values()) {
            player.invulnerableSteps = 0;
        }
        this.turn += 1;
        this.attackerColor = this.attackerColor === 'red' ? 'blue' : 'red';
        this.updateRoles();
        this.touchActivity();
        this.clearNextRoundTimeout();
        this.nextRoundTimeout = setTimeout(() => {
            this.nextRoundTimeout = null;
            this.startRound();
        }, 500);
    }
    validatePlan(player, path, skills) {
        const pathPoints = (0, GameEngine_1.calcPathPoints)(this.turn);
        const uniqueSkills = Array.from(new Map(skills.map((skill) => [skill.skillId, skill])).values())
            .map((skill) => ({ ...skill, target: skill.target ?? null }))
            .sort((left, right) => left.order - right.order);
        const isOverdriveTurn = player.overdriveActive;
        const manaCost = uniqueSkills.reduce((sum, skill) => sum + SKILL_COSTS[skill.skillId], 0);
        if (manaCost > player.mana)
            return null;
        const hasGuard = uniqueSkills.some((skill) => skill.skillId === 'classic_guard');
        const hasOverdrive = uniqueSkills.some((skill) => skill.skillId === 'gold_overdrive');
        const teleport = uniqueSkills.find((skill) => skill.skillId === 'quantum_shift') ?? null;
        const hasBlitz = uniqueSkills.some((skill) => skill.skillId === 'electric_blitz');
        const blitz = uniqueSkills.find((skill) => skill.skillId === 'electric_blitz') ?? null;
        const hasAttackSkill = uniqueSkills.some((skill) => skill.skillId === 'ember_blast' ||
            skill.skillId === 'inferno_field' ||
            skill.skillId === 'nova_blast' ||
            skill.skillId === 'electric_blitz' ||
            skill.skillId === 'cosmic_bigbang');
        const hasBigBang = uniqueSkills.some((skill) => skill.skillId === 'cosmic_bigbang');
        const bigBang = uniqueSkills.find((skill) => skill.skillId === 'cosmic_bigbang') ?? null;
        const hasCharge = uniqueSkills.some((skill) => skill.skillId === 'plasma_charge');
        if (hasGuard && player.role !== 'escaper')
            return null;
        if (hasAttackSkill && player.role !== 'attacker')
            return null;
        if (player.reboundLocked && path.length > 0)
            return null;
        if (!isOverdriveTurn) {
            if (hasGuard) {
                const guardSkill = uniqueSkills.find((skill) => skill.skillId === 'classic_guard');
                if (!guardSkill || guardSkill.step !== 0 || path.length > 0)
                    return null;
            }
            if (hasCharge) {
                const chargeSkill = uniqueSkills.find((skill) => skill.skillId === 'plasma_charge');
                if (!chargeSkill || chargeSkill.step !== 0 || path.length > 0)
                    return null;
            }
            if (hasBigBang) {
                if (!bigBang || bigBang.step !== 0 || path.length > 0)
                    return null;
                if (uniqueSkills.length !== 1)
                    return null;
                return {
                    path: [],
                    skills: uniqueSkills,
                };
            }
            if (hasBlitz) {
                if (!blitz || !blitz.target)
                    return null;
                if (uniqueSkills.length !== 1)
                    return null;
                if (blitz.step < 0 || blitz.step > path.length)
                    return null;
                const prefixPath = path.slice(0, blitz.step);
                if (!(0, GameEngine_1.isValidPath)(player.position, prefixPath, pathPoints, this.obstacles)) {
                    return null;
                }
                const blitzOrigin = blitz.step === 0 ? player.position : prefixPath[prefixPath.length - 1];
                if (!blitzOrigin)
                    return null;
                const blitzPath = buildBlitzPath(blitzOrigin, blitz.target);
                if (blitzPath.length === 0)
                    return null;
                const expectedPath = [...prefixPath, ...blitzPath];
                if (path.length !== expectedPath.length)
                    return null;
                for (let index = 0; index < expectedPath.length; index++) {
                    if (!posEqual(path[index], expectedPath[index]))
                        return null;
                }
                return {
                    path: expectedPath,
                    skills: uniqueSkills,
                };
            }
            if (teleport) {
                if (!teleport.target)
                    return null;
                if (teleport.step < 0 || teleport.step > path.length)
                    return null;
                const teleportOrigin = teleport.step === 0 ? player.position : path[teleport.step - 1];
                if (!teleportOrigin)
                    return null;
                const rowDelta = Math.abs(teleport.target.row - teleportOrigin.row);
                const colDelta = Math.abs(teleport.target.col - teleportOrigin.col);
                if (rowDelta > 1 || colDelta > 1 || (rowDelta === 0 && colDelta === 0))
                    return null;
                if (this.obstacles.some((obstacle) => obstacle.row === teleport.target.row && obstacle.col === teleport.target.col))
                    return null;
                if (teleport.target.row < 0 || teleport.target.row > 4 || teleport.target.col < 0 || teleport.target.col > 4)
                    return null;
            }
            if (teleport) {
                const prefixPath = path.slice(0, teleport.step);
                const suffixPath = path.slice(teleport.step);
                if (!(0, GameEngine_1.isValidPath)(player.position, prefixPath, hasGuard ? 0 : pathPoints, this.obstacles))
                    return null;
                if (!(0, GameEngine_1.isValidPath)(teleport.target, suffixPath, hasGuard ? 0 : pathPoints, this.obstacles))
                    return null;
            }
            else if (!(0, GameEngine_1.isValidPath)(player.position, path, hasGuard ? 0 : pathPoints, this.obstacles)) {
                return null;
            }
            for (const skill of uniqueSkills) {
                if ((skill.skillId === 'ember_blast' ||
                    skill.skillId === 'inferno_field' ||
                    skill.skillId === 'nova_blast' ||
                    skill.skillId === 'aurora_heal' ||
                    skill.skillId === 'void_cloak') &&
                    skill.step > path.length)
                    return null;
                if (skill.skillId === 'inferno_field') {
                    if (!skill.target)
                        return null;
                    if (skill.target.row < 0 ||
                        skill.target.row > 4 ||
                        skill.target.col < 0 ||
                        skill.target.col > 4)
                        return null;
                    const infernoOrigin = skill.step === 0 ? player.position : path[skill.step - 1];
                    if (infernoOrigin && posEqual(infernoOrigin, skill.target))
                        return null;
                }
                if (skill.skillId === 'classic_guard' && skill.step !== 0)
                    return null;
                if (skill.skillId === 'cosmic_bigbang' && skill.step !== 0)
                    return null;
            }
            if (hasOverdrive) {
                const overdriveSkill = uniqueSkills.find((skill) => skill.skillId === 'gold_overdrive');
                if (!overdriveSkill || overdriveSkill.step > path.length)
                    return null;
            }
            return {
                path: [...path],
                skills: uniqueSkills,
            };
        }
        const movementSkills = uniqueSkills
            .filter((skill) => skill.skillId === 'quantum_shift' || skill.skillId === 'electric_blitz')
            .sort((left, right) => {
            if (left.step !== right.step)
                return left.step - right.step;
            return left.order - right.order;
        });
        let cursor = 0;
        let segmentStart = player.position;
        for (const skill of uniqueSkills) {
            if (skill.step < 0 || skill.step > path.length)
                return null;
            if (skill.skillId === 'quantum_shift' && !skill.target)
                return null;
            if (skill.skillId === 'electric_blitz' && !skill.target)
                return null;
            if (skill.skillId === 'inferno_field') {
                if (!skill.target)
                    return null;
                if (skill.target.row < 0 ||
                    skill.target.row > 4 ||
                    skill.target.col < 0 ||
                    skill.target.col > 4)
                    return null;
                const infernoOrigin = skill.step === 0 ? player.position : path[skill.step - 1];
                if (infernoOrigin && posEqual(infernoOrigin, skill.target))
                    return null;
            }
        }
        for (const movementSkill of movementSkills) {
            if (movementSkill.step < cursor)
                return null;
            const prefixSegment = path.slice(cursor, movementSkill.step);
            if (!(0, GameEngine_1.isValidPath)(segmentStart, prefixSegment, pathPoints, this.obstacles)) {
                return null;
            }
            const movementOrigin = prefixSegment.length > 0
                ? prefixSegment[prefixSegment.length - 1]
                : segmentStart;
            if (movementSkill.skillId === 'quantum_shift') {
                const target = movementSkill.target;
                const rowDelta = Math.abs(target.row - movementOrigin.row);
                const colDelta = Math.abs(target.col - movementOrigin.col);
                if (rowDelta > 1 || colDelta > 1 || (rowDelta === 0 && colDelta === 0))
                    return null;
                if (target.row < 0 || target.row > 4 || target.col < 0 || target.col > 4)
                    return null;
                if (this.obstacles.some((obstacle) => obstacle.row === target.row && obstacle.col === target.col)) {
                    return null;
                }
                segmentStart = target;
                cursor = movementSkill.step;
                continue;
            }
            const target = movementSkill.target;
            const blitzPath = buildBlitzPath(movementOrigin, target);
            if (blitzPath.length === 0)
                return null;
            const authoredBlitzPath = path.slice(movementSkill.step, movementSkill.step + blitzPath.length);
            if (authoredBlitzPath.length !== blitzPath.length)
                return null;
            for (let index = 0; index < blitzPath.length; index++) {
                if (!posEqual(blitzPath[index], authoredBlitzPath[index]))
                    return null;
            }
            segmentStart = blitzPath[blitzPath.length - 1];
            cursor = movementSkill.step + blitzPath.length;
        }
        const suffix = path.slice(cursor);
        if (!(0, GameEngine_1.isValidPath)(segmentStart, suffix, pathPoints, this.obstacles)) {
            return null;
        }
        return {
            path: [...path],
            skills: uniqueSkills,
        };
    }
    getPlayerBySocket(socketId) {
        return [...this.players.values()].find((player) => player.socketId === socketId);
    }
    emitToOpponent(socketId, event, data) {
        for (const player of this.players.values()) {
            if (player.socketId !== socketId) {
                this.io.to(player.socketId).emit(event, data);
                return;
            }
        }
    }
    toClientPlayer(player) {
        const base = (0, GameEngine_1.toClientPlayer)(player);
        return {
            ...base,
            mana: player.mana,
            invulnerableSteps: player.invulnerableSteps,
            overdriveActive: player.overdriveActive,
            reboundLocked: player.reboundLocked,
            hidden: player.hidden,
            equippedSkills: player.equippedSkills,
        };
    }
    resetPlayers() {
        const initial = (0, GameEngine_1.getInitialPositions)();
        for (const [color, player] of this.players.entries()) {
            player.hp = 3;
            player.position = { ...initial[color] };
            player.plannedPath = [];
            player.plannedSkills = [];
            player.pathSubmitted = false;
            player.mana = INITIAL_MANA;
            player.invulnerableSteps = 0;
            player.pendingManaBonus = 0;
            player.pendingOverdriveStage = 0;
            player.pendingVoidCloak = false;
            player.overdriveActive = false;
            player.reboundLocked = false;
            player.hidden = false;
        }
    }
    updateRoles() {
        for (const [color, player] of this.players.entries()) {
            player.role = color === this.attackerColor ? 'attacker' : 'escaper';
        }
    }
    resetGame() {
        this.timer.clear();
        this.clearPendingTimeouts();
        this.turn = 1;
        this.attackerColor = 'red';
        this.phase = 'waiting';
        this.obstacles = [];
        this.lavaTiles = [];
        this.resetPlayers();
        this.updateRoles();
        this.readySockets.clear();
        this.pendingStart = false;
        this.pendingStartPaused = false;
        this.rewardsGranted = false;
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
exports.AbilityRoom = AbilityRoom;
