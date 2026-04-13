"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AbilityRoom = void 0;
const GameEngine_1 = require("../GameEngine");
const AiPlanner_1 = require("../AiPlanner");
const ServerTimer_1 = require("../ServerTimer");
const playerAuth_1 = require("../../services/playerAuth");
const achievementService_1 = require("../../services/achievementService");
const AbilityTypes_1 = require("./AbilityTypes");
const AbilityEngine_1 = require("./AbilityEngine");
const PLANNING_TIME_MS = 9000;
const SUBMIT_GRACE_MS = 350;
const INITIAL_MANA = 4;
const MAX_MANA = 10;
const MANA_PER_TURN = 2;
const SKILL_EVENT_BUFFER_MS = 1100;
const AT_FIELD_END_DELAY_MS = 700;
const TIME_REWIND_FREEZE_MS = 600;
const TIME_REWIND_HP_STEP_MS = 120;
const OVERDRIVE_MANA = 20;
const ABILITY_STARTING_HP = 5;
const TRAINING_STARTING_MANA = 10;
const TRAINING_PATH_POINTS = 10;
const TRAINING_DUMMY_POSITION = { row: 2, col: 2 };
const ABILITY_FAKE_AI_DEBUG_LOG = false;
const ABILITY_FAKE_AI_SKILL_POOL = [
    'classic_guard',
    'ember_blast',
    'nova_blast',
    'inferno_field',
    'quantum_shift',
    'cosmic_bigbang',
    'arc_reactor_field',
    'electric_blitz',
    'wizard_magic_mine',
    'chronos_time_rewind',
    'atomic_fission',
    'sun_chariot',
];
function collectUtilitySkillUsageByUser(players, skillEvents) {
    const usage = new Map();
    for (const event of skillEvents) {
        if (event.skillId !== 'aurora_heal' &&
            event.skillId !== 'quantum_shift' &&
            event.skillId !== 'plasma_charge' &&
            event.skillId !== 'void_cloak' &&
            event.skillId !== 'phase_shift' &&
            event.skillId !== 'gold_overdrive' &&
            event.skillId !== 'wizard_magic_mine' &&
            event.skillId !== 'chronos_time_rewind') {
            continue;
        }
        const userId = players.get(event.color)?.userId;
        if (!userId)
            continue;
        const current = usage.get(userId) ?? [];
        current.push(event.skillId);
        usage.set(userId, current);
    }
    return Object.fromEntries(usage);
}
function collectBlockEventsByUser(players, blocks) {
    const result = new Map();
    for (const block of blocks) {
        const userId = players.get(block.color)?.userId;
        if (!userId)
            continue;
        const current = result.get(userId) ?? [];
        current.push(block.skillId);
        result.set(userId, current);
    }
    return Object.fromEntries(result);
}
function findFinisherSkillId(loserColor, skillEvents) {
    for (let index = skillEvents.length - 1; index >= 0; index -= 1) {
        const event = skillEvents[index];
        const killedTarget = event.damages?.some((damage) => damage.color === loserColor && damage.newHp <= 0);
        if (!killedTarget)
            continue;
        if (event.skillId === 'ember_blast' ||
            event.skillId === 'atomic_fission' ||
            event.skillId === 'inferno_field' ||
            event.skillId === 'nova_blast' ||
            event.skillId === 'sun_chariot' ||
            event.skillId === 'electric_blitz' ||
            event.skillId === 'cosmic_bigbang' ||
            event.skillId === 'wizard_magic_mine') {
            return event.skillId;
        }
    }
    return null;
}
function posEqual(a, b) {
    return a.row === b.row && a.col === b.col;
}
function toKey(position) {
    return `${position.row},${position.col}`;
}
function inBoard(position) {
    return (position.row >= 0 &&
        position.row <= 4 &&
        position.col >= 0 &&
        position.col <= 4);
}
function manhattan(a, b) {
    return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}
function isObstacle(position, obstacles) {
    return obstacles.some((obstacle) => posEqual(obstacle, position));
}
function getCardinalNeighbors(position, obstacles) {
    return [
        { row: position.row - 1, col: position.col },
        { row: position.row + 1, col: position.col },
        { row: position.row, col: position.col - 1 },
        { row: position.row, col: position.col + 1 },
    ].filter((candidate) => inBoard(candidate) &&
        (0, GameEngine_1.isValidMove)(position, candidate) &&
        !isObstacle(candidate, obstacles));
}
function getAdjacentBlinkTargets(origin, obstacles, forbidden) {
    const targets = [];
    for (let rowDelta = -1; rowDelta <= 1; rowDelta += 1) {
        for (let colDelta = -1; colDelta <= 1; colDelta += 1) {
            if (rowDelta === 0 && colDelta === 0)
                continue;
            const target = { row: origin.row + rowDelta, col: origin.col + colDelta };
            if (!inBoard(target))
                continue;
            if (isObstacle(target, obstacles))
                continue;
            if (forbidden && posEqual(target, forbidden))
                continue;
            targets.push(target);
        }
    }
    return targets;
}
function listBoardPositions() {
    const positions = [];
    for (let row = 0; row < 5; row += 1) {
        for (let col = 0; col < 5; col += 1) {
            positions.push({ row, col });
        }
    }
    return positions;
}
function pathKey(path) {
    return path.map((position) => toKey(position)).join('>');
}
function buildShortestAbilityPath(from, to, obstacles) {
    if (posEqual(from, to))
        return [];
    const queue = [{ ...from }];
    const visited = new Set([toKey(from)]);
    const previous = new Map();
    const positionMap = new Map([[toKey(from), { ...from }]]);
    const targetKey = toKey(to);
    while (queue.length > 0) {
        const current = queue.shift();
        const currentKey = toKey(current);
        if (currentKey === targetKey)
            break;
        for (const next of getCardinalNeighbors(current, obstacles)) {
            const nextKey = toKey(next);
            if (visited.has(nextKey))
                continue;
            visited.add(nextKey);
            previous.set(nextKey, currentKey);
            positionMap.set(nextKey, next);
            queue.push(next);
        }
    }
    if (!visited.has(targetKey))
        return [];
    const reversedPath = [];
    let cursor = targetKey;
    while (cursor !== toKey(from)) {
        const position = positionMap.get(cursor);
        if (!position)
            break;
        reversedPath.push(position);
        cursor = previous.get(cursor);
    }
    return reversedPath.reverse();
}
function getSequencePosition(start, path, step) {
    if (step <= 0)
        return start;
    return path[Math.min(step - 1, path.length - 1)] ?? start;
}
function buildBotPathModel(params) {
    const { start, opponent, role, pathPoints, obstacles } = params;
    const candidates = [];
    const primary = (0, AiPlanner_1.createAiPath)({
        color: 'red',
        role,
        selfPosition: start,
        opponentPosition: opponent,
        pathPoints,
        obstacles,
    });
    candidates.push({ path: primary, score: 999 });
    for (const cell of listBoardPositions()) {
        if (posEqual(cell, start) || isObstacle(cell, obstacles))
            continue;
        const path = buildShortestAbilityPath(start, cell, obstacles).slice(0, pathPoints);
        if (path.length === 0 || path.length > pathPoints)
            continue;
        const finalPosition = path[path.length - 1] ?? start;
        const openNeighbors = getCardinalNeighbors(finalPosition, obstacles).length;
        const heuristic = role === 'attacker'
            ? Math.max(0, 6 - manhattan(finalPosition, opponent)) * 8 +
                openNeighbors * 2
            : manhattan(finalPosition, opponent) * 7 +
                openNeighbors * 3 -
                (finalPosition.row === 0 ||
                    finalPosition.row === 4 ||
                    finalPosition.col === 0 ||
                    finalPosition.col === 4
                    ? 2
                    : 0);
        candidates.push({ path, score: heuristic });
    }
    const deduped = new Map();
    for (const candidate of candidates) {
        const key = pathKey(candidate.path);
        const existing = deduped.get(key);
        if (!existing || candidate.score > existing.score) {
            deduped.set(key, candidate);
        }
    }
    const paths = [...deduped.values()]
        .sort((left, right) => right.score - left.score)
        .slice(0, 20)
        .map((entry) => entry.path);
    const heatmap = new Map();
    const timeHeatmap = new Map();
    for (const path of paths) {
        const sequence = [start, ...path];
        for (let index = 0; index < sequence.length; index += 1) {
            const key = toKey(sequence[index]);
            heatmap.set(key, (heatmap.get(key) ?? 0) + 1);
            timeHeatmap.set(`${index}:${key}`, (timeHeatmap.get(`${index}:${key}`) ?? 0) + 1);
        }
    }
    const hotspotCells = [...heatmap.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 8)
        .map(([key]) => {
        const [row, col] = key.split(',').map(Number);
        return { row, col };
    });
    return { paths, heatmap, timeHeatmap, hotspotCells };
}
function scoreAttackPathAgainstModel(start, path, opponentStart, enemyModel, obstacles) {
    const mySequence = [start, ...path];
    let score = 0;
    for (const enemyPath of enemyModel.paths) {
        const enemySequence = [opponentStart, ...enemyPath];
        const maxSteps = Math.max(mySequence.length, enemySequence.length);
        for (let step = 0; step < maxSteps; step += 1) {
            const myCurrent = mySequence[Math.min(step, mySequence.length - 1)];
            const enemyCurrent = enemySequence[Math.min(step, enemySequence.length - 1)];
            const myPrev = mySequence[Math.max(0, Math.min(step - 1, mySequence.length - 1))];
            const enemyPrev = enemySequence[Math.max(0, Math.min(step - 1, enemySequence.length - 1))];
            if (posEqual(myCurrent, enemyCurrent)) {
                score += 240;
            }
            else if (posEqual(myCurrent, enemyPrev) && posEqual(enemyCurrent, myPrev)) {
                score += 200;
            }
            else {
                const distance = manhattan(myCurrent, enemyCurrent);
                if (distance === 1)
                    score += 24;
            }
        }
    }
    for (const step of mySequence) {
        score += (enemyModel.heatmap.get(toKey(step)) ?? 0) * 10;
    }
    for (let index = 0; index < mySequence.length; index += 1) {
        score += (enemyModel.timeHeatmap.get(`${index}:${toKey(mySequence[index])}`) ?? 0) * 12;
    }
    const finalPosition = path[path.length - 1] ?? start;
    score += getCardinalNeighbors(finalPosition, obstacles).length * 6;
    return score;
}
function scoreEscapePathAgainstModel(start, path, opponentStart, threatModel, obstacles) {
    const mySequence = [start, ...path];
    let score = 0;
    for (const enemyPath of threatModel.paths) {
        const enemySequence = [opponentStart, ...enemyPath];
        const maxSteps = Math.max(mySequence.length, enemySequence.length);
        for (let step = 0; step < maxSteps; step += 1) {
            const myCurrent = mySequence[Math.min(step, mySequence.length - 1)];
            const enemyCurrent = enemySequence[Math.min(step, enemySequence.length - 1)];
            const myPrev = mySequence[Math.max(0, Math.min(step - 1, mySequence.length - 1))];
            const enemyPrev = enemySequence[Math.max(0, Math.min(step - 1, enemySequence.length - 1))];
            if (posEqual(myCurrent, enemyCurrent)) {
                score -= 260;
            }
            else if (posEqual(myCurrent, enemyPrev) && posEqual(enemyCurrent, myPrev)) {
                score -= 220;
            }
            else {
                const distance = manhattan(myCurrent, enemyCurrent);
                if (distance === 1)
                    score -= 30;
            }
        }
    }
    for (const step of mySequence) {
        score -= (threatModel.heatmap.get(toKey(step)) ?? 0) * 12;
    }
    for (let index = 0; index < mySequence.length; index += 1) {
        score -= (threatModel.timeHeatmap.get(`${index}:${toKey(mySequence[index])}`) ?? 0) * 14;
    }
    const finalPosition = path[path.length - 1] ?? start;
    const finalMobility = getCardinalNeighbors(finalPosition, obstacles).length;
    const futureMobility = getCardinalNeighbors(finalPosition, obstacles).reduce((sum, neighbor) => sum + getCardinalNeighbors(neighbor, obstacles).length, 0);
    score += manhattan(finalPosition, opponentStart) * 9;
    score += finalMobility * 16;
    score += futureMobility * 5;
    if (finalPosition.row === 0 ||
        finalPosition.row === 4 ||
        finalPosition.col === 0 ||
        finalPosition.col === 4) {
        score -= 8;
    }
    return score;
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
function getBlitzDirectionTowardOpponent(self, opponent) {
    if (self.row === opponent.row) {
        return {
            row: self.row,
            col: self.col + (opponent.col > self.col ? 1 : -1),
        };
    }
    if (self.col === opponent.col) {
        return {
            row: self.row + (opponent.row > self.row ? 1 : -1),
            col: self.col,
        };
    }
    return null;
}
function getCrossPositions(origin) {
    return [
        origin,
        { row: origin.row - 1, col: origin.col },
        { row: origin.row + 1, col: origin.col },
        { row: origin.row, col: origin.col - 1 },
        { row: origin.row, col: origin.col + 1 },
    ].filter((position) => inBoard(position));
}
function getNovaPositions(origin) {
    const positions = [origin];
    for (const distance of [1, 2]) {
        positions.push({ row: origin.row - distance, col: origin.col - distance }, { row: origin.row - distance, col: origin.col + distance }, { row: origin.row + distance, col: origin.col - distance }, { row: origin.row + distance, col: origin.col + distance });
    }
    return positions.filter((position) => inBoard(position));
}
function getSquarePositions(origin, radius = 1) {
    const positions = [];
    for (let row = origin.row - radius; row <= origin.row + radius; row += 1) {
        for (let col = origin.col - radius; col <= origin.col + radius; col += 1) {
            const position = { row, col };
            if (!inBoard(position))
                continue;
            positions.push(position);
        }
    }
    return positions;
}
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
function normalizeSkillReservations(skills) {
    return Array.from(new Map(skills.map((skill) => [skill.skillId, skill])).values())
        .map((skill) => ({ ...skill, target: skill.target ?? null }))
        .sort((left, right) => left.order - right.order);
}
function validateSkillRoleRestrictions(player, skills) {
    return skills.every((skill) => {
        const { roleRestriction } = AbilityTypes_1.ABILITY_SKILL_SERVER_RULES[skill.skillId];
        if (roleRestriction === 'attacker')
            return player.role === 'attacker';
        if (roleRestriction === 'escaper')
            return player.role === 'escaper';
        return true;
    });
}
function validateCommonSkillReservations(player, skills, path, isOverdriveTurn) {
    const pathLength = path.length;
    const hasExclusiveSkill = skills.some((skill) => AbilityTypes_1.ABILITY_SKILL_SERVER_RULES[skill.skillId].exclusiveWhenNotOverdrive);
    if (!isOverdriveTurn && hasExclusiveSkill && skills.length !== 1) {
        return false;
    }
    return skills.every((skill) => {
        const rule = AbilityTypes_1.ABILITY_SKILL_SERVER_RULES[skill.skillId];
        if (skill.step < 0 || skill.step > pathLength)
            return false;
        if (rule.targetRule === 'position' && !skill.target)
            return false;
        if (rule.stepRule === 'zero_only' && skill.step !== 0)
            return false;
        if (!isOverdriveTurn &&
            rule.requiresEmptyPathWhenNotOverdrive &&
            pathLength > 0) {
            return false;
        }
        if (rule.requiresPreviousTurnPath &&
            (!player.previousTurnStart || player.previousTurnPath.length === 0)) {
            return false;
        }
        return true;
    });
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
        this.trapTiles = [];
        this.readySockets = new Set();
        this.pendingStart = false;
        this.pendingStartPaused = false;
        this.trainingMode = false;
        this.privateMatch = false;
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
    get currentTurn() {
        return this.turn;
    }
    getSocketIds() {
        return [...this.players.values()].map((player) => player.socketId);
    }
    enableTrainingMode() {
        this.trainingMode = true;
    }
    enablePrivateMatch() {
        this.privateMatch = true;
    }
    isRewardEligible() {
        return !this.trainingMode && !this.privateMatch;
    }
    addPlayer(socket, nickname, userId, stats, pieceSkin, boardSkin, equippedSkills) {
        if (this.isFull)
            return null;
        const color = this.players.size === 0 ? 'red' : 'blue';
        const initialPositions = (0, GameEngine_1.getInitialPositions)();
        this.players.set(color, {
            id: userId ?? socket.id,
            userId,
            socketId: socket.id,
            isBot: false,
            nickname,
            color,
            pieceSkin,
            boardSkin,
            hp: ABILITY_STARTING_HP,
            position: { ...initialPositions[color] },
            plannedPath: [],
            previousTurnStart: null,
            previousTurnPath: [],
            plannedSkills: [],
            pathSubmitted: false,
            role: color === 'red' ? 'attacker' : 'escaper',
            stats,
            disconnectLossRecorded: false,
            mana: this.trainingMode ? TRAINING_STARTING_MANA : INITIAL_MANA,
            invulnerableSteps: 0,
            pendingManaBonus: 0,
            pendingOverdriveStage: 0,
            pendingVoidCloak: false,
            overdriveActive: false,
            reboundLocked: false,
            hidden: false,
            equippedSkills,
            timeRewindUsed: false,
            turnHistory: [],
        });
        socket.join(this.roomId);
        this.touchActivity();
        return color;
    }
    addIdleBot(nickname, pieceSkin, boardSkin, equippedSkills = [], options) {
        if (this.isFull)
            return null;
        const color = this.players.size === 0 ? 'red' : 'blue';
        const initialPositions = (0, GameEngine_1.getInitialPositions)();
        this.players.set(color, {
            id: options?.displayId ?? `bot:${this.roomId}:${color}`,
            userId: null,
            socketId: `bot:${this.roomId}:${color}`,
            isBot: true,
            nickname,
            color,
            pieceSkin,
            boardSkin,
            hp: ABILITY_STARTING_HP,
            position: this.trainingMode
                ? { ...TRAINING_DUMMY_POSITION }
                : { ...initialPositions[color] },
            plannedPath: [],
            previousTurnStart: null,
            previousTurnPath: [],
            plannedSkills: [],
            pathSubmitted: false,
            role: color === 'red' ? 'attacker' : 'escaper',
            stats: options?.stats ?? { wins: 0, losses: 0 },
            disconnectLossRecorded: false,
            mana: this.trainingMode ? TRAINING_STARTING_MANA : INITIAL_MANA,
            invulnerableSteps: 0,
            pendingManaBonus: 0,
            pendingOverdriveStage: 0,
            pendingVoidCloak: false,
            overdriveActive: false,
            reboundLocked: false,
            hidden: false,
            equippedSkills,
            timeRewindUsed: false,
            turnHistory: [],
        });
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
        const humanSocketIds = [...this.players.values()]
            .filter((entry) => !entry.isBot)
            .map((entry) => entry.socketId);
        const allReady = humanSocketIds.length > 0 &&
            humanSocketIds.every((id) => this.readySockets.has(id));
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
        for (const player of this.players.values()) {
            this.io.to(player.socketId).emit('ability_game_start', this.toClientState(player.color));
        }
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
            const wasActive = this.phase === 'planning' || this.phase === 'moving';
            if (wasActive && !player.isBot) {
                if (player.userId && !player.disconnectLossRecorded) {
                    player.stats.losses += 1;
                    player.disconnectLossRecorded = true;
                    void (0, playerAuth_1.recordMatchmakingLoss)(player.userId);
                }
                player.connected = false;
                player.pathSubmitted = true;
                player.plannedPath = [];
                player.plannedSkills = [];
                this.readySockets.delete(socketId);
                this.touchActivity();
                if (this.phase === 'planning') {
                    const allSubmitted = [...this.players.values()].every((entry) => entry.pathSubmitted);
                    if (allSubmitted) {
                        this.timer.clear();
                        this.clearPlanningGraceTimeout();
                        this.revealPlans();
                    }
                }
                break;
            }
            this.players.delete(color);
            this.timer.clear();
            this.clearPendingTimeouts();
            this.readySockets.clear();
            this.pendingStart = false;
            this.pendingStartPaused = false;
            this.touchActivity();
            break;
        }
        return { disconnectedColor, shouldAwardDisconnectResult, winnerColor };
    }
    toClientState(forColor) {
        const red = this.players.get('red');
        const blue = this.players.get('blue');
        return {
            roomId: this.roomId,
            code: this.code,
            turn: this.turn,
            phase: this.phase,
            pathPoints: this.currentPathPoints(),
            obstacles: this.obstacles,
            lavaTiles: this.lavaTiles,
            trapTiles: forColor
                ? this.trapTiles.filter((trap) => trap.owner === forColor)
                : [],
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
        if (red.connected === false) {
            red.pathSubmitted = true;
        }
        if (blue.connected === false) {
            blue.pathSubmitted = true;
        }
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
        if (red.isBot) {
            this.planBotTurn(red, blue);
        }
        if (blue.isBot) {
            this.planBotTurn(blue, red);
        }
        this.recordTurnSnapshot(red);
        this.recordTurnSnapshot(blue);
        const now = Date.now();
        this.touchActivity(now);
        for (const player of this.players.values()) {
            const payload = {
                timeLimit: PLANNING_TIME_MS / 1000,
                roundEndsAt: now + PLANNING_TIME_MS,
                state: this.toClientState(player.color),
            };
            this.io.to(player.socketId).emit('ability_round_start', payload);
        }
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
            trapTiles: this.trapTiles,
        });
        this.applyTimeRewindIfNeeded('red', red, resolution);
        this.applyTimeRewindIfNeeded('blue', blue, resolution);
        red.previousTurnStart = { ...resolution.payload.redStart };
        red.previousTurnPath = resolution.payload.redPath.map((position) => ({ ...position }));
        blue.previousTurnStart = { ...resolution.payload.blueStart };
        blue.previousTurnPath = resolution.payload.bluePath.map((position) => ({ ...position }));
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
        this.trapTiles = resolution.trapTiles;
        this.touchActivity();
        for (const player of this.players.values()) {
            this.io.to(player.socketId).emit('ability_resolution', {
                ...resolution.payload,
                trapTiles: this.trapTiles.filter((trap) => trap.owner === player.color),
            });
        }
        if (this.isRewardEligible()) {
            void (0, achievementService_1.recordAbilityUtilityUsage)({
                byUserId: collectUtilitySkillUsageByUser(this.players, resolution.payload.skillEvents),
            });
            void (0, achievementService_1.recordAbilityBlockEvents)({
                byUserId: collectBlockEventsByUser(this.players, resolution.payload.blocks),
            });
        }
        const atFieldEventCount = resolution.payload.skillEvents.filter((event) => event.skillId === 'arc_reactor_field').length;
        const timeRewindExtraDelayMs = resolution.payload.skillEvents
            .filter((event) => event.skillId === 'chronos_time_rewind')
            .reduce((sum, event) => {
            const rewindTicks = Math.max(event.affectedPositions?.length ?? 0, event.rewindHp ?? 0);
            const rewindDuration = TIME_REWIND_FREEZE_MS +
                rewindTicks * TIME_REWIND_HP_STEP_MS +
                40;
            return sum + Math.max(0, rewindDuration - SKILL_EVENT_BUFFER_MS);
        }, 0);
        const animTime = (0, GameEngine_1.calcAnimationDuration)(Math.max(red.plannedPath.length, blue.plannedPath.length) + resolution.payload.skillEvents.length) +
            resolution.payload.skillEvents.length * SKILL_EVENT_BUFFER_MS +
            atFieldEventCount * AT_FIELD_END_DELAY_MS +
            timeRewindExtraDelayMs;
        this.clearMovingCompleteTimeout();
        this.movingCompleteTimeout = setTimeout(() => {
            this.movingCompleteTimeout = null;
            this.onMovingComplete(resolution.winner, resolution.payload);
        }, animTime);
    }
    onMovingComplete(winner, resolutionPayload) {
        if (this.phase !== 'moving')
            return;
        if (!this.hasBothPlayers())
            return;
        if (this.isRewardEligible()) {
            void (0, achievementService_1.recordMatchPlayed)({
                userIds: [...this.players.values()].map((player) => player.userId),
                matchType: 'ability',
            });
        }
        if (winner) {
            this.phase = 'gameover';
            if (winner !== 'draw' && !this.rewardsGranted && this.isRewardEligible()) {
                const loserColor = winner === 'red' ? 'blue' : 'red';
                const winnerUserId = this.players.get(winner)?.userId ?? null;
                const loserUserId = this.players.get(loserColor)?.userId ?? null;
                const loserLossAlreadyRecorded = this.players.get(loserColor)?.disconnectLossRecorded === true;
                this.players.get(winner).stats.wins += 1;
                if (!loserLossAlreadyRecorded) {
                    this.players.get(loserColor).stats.losses += 1;
                }
                if (winnerUserId && loserUserId && !loserLossAlreadyRecorded) {
                    void (0, playerAuth_1.recordMatchmakingResult)(winnerUserId, loserUserId);
                }
                else {
                    if (winnerUserId) {
                        void (0, playerAuth_1.recordMatchmakingWin)(winnerUserId);
                    }
                    if (loserUserId && !loserLossAlreadyRecorded) {
                        void (0, playerAuth_1.recordMatchmakingLoss)(loserUserId);
                    }
                }
                void (0, achievementService_1.recordModeWin)({ userId: winnerUserId, mode: 'ability' });
                void (0, achievementService_1.recordAbilitySpecialWin)({
                    winnerUserId,
                    winnerHp: this.players.get(winner)?.hp ?? 0,
                    disconnectWin: false,
                });
                void (0, achievementService_1.recordAbilitySkillFinish)({
                    winnerUserId,
                    finisherSkillId: resolutionPayload
                        ? findFinisherSkillId(loserColor, resolutionPayload.skillEvents)
                        : null,
                });
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
        const pathPoints = this.currentPathPoints();
        const uniqueSkills = normalizeSkillReservations(skills);
        const isOverdriveTurn = player.overdriveActive;
        const manaCost = uniqueSkills.reduce((sum, skill) => sum + AbilityTypes_1.ABILITY_SKILL_COSTS[skill.skillId], 0);
        if (manaCost > player.mana)
            return null;
        if (!validateSkillRoleRestrictions(player, uniqueSkills))
            return null;
        if (!validateCommonSkillReservations(player, uniqueSkills, path, isOverdriveTurn)) {
            return null;
        }
        const hasGuard = uniqueSkills.some((skill) => skill.skillId === 'classic_guard');
        const hasAtField = uniqueSkills.some((skill) => skill.skillId === 'arc_reactor_field');
        const hasPhaseShift = uniqueSkills.some((skill) => skill.skillId === 'phase_shift');
        const hasOverdrive = uniqueSkills.some((skill) => skill.skillId === 'gold_overdrive');
        const teleport = uniqueSkills.find((skill) => skill.skillId === 'quantum_shift') ?? null;
        const hasBlitz = uniqueSkills.some((skill) => skill.skillId === 'electric_blitz');
        const blitz = uniqueSkills.find((skill) => skill.skillId === 'electric_blitz') ?? null;
        const hasAttackSkill = uniqueSkills.some((skill) => skill.skillId === 'ember_blast' ||
            skill.skillId === 'atomic_fission' ||
            skill.skillId === 'inferno_field' ||
            skill.skillId === 'nova_blast' ||
            skill.skillId === 'sun_chariot' ||
            skill.skillId === 'electric_blitz' ||
            skill.skillId === 'cosmic_bigbang' ||
            skill.skillId === 'wizard_magic_mine');
        const hasBigBang = uniqueSkills.some((skill) => skill.skillId === 'cosmic_bigbang');
        const bigBang = uniqueSkills.find((skill) => skill.skillId === 'cosmic_bigbang') ?? null;
        const hasCharge = uniqueSkills.some((skill) => skill.skillId === 'plasma_charge');
        const hasAtomic = uniqueSkills.some((skill) => skill.skillId === 'atomic_fission');
        if (player.reboundLocked && path.length > 0)
            return null;
        if (!isOverdriveTurn) {
            if (hasBigBang) {
                if (!bigBang)
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
            const validationObstacles = hasPhaseShift ? [] : this.obstacles;
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
                if (validationObstacles.some((obstacle) => obstacle.row === teleport.target.row && obstacle.col === teleport.target.col))
                    return null;
                if (teleport.target.row < 0 || teleport.target.row > 4 || teleport.target.col < 0 || teleport.target.col > 4)
                    return null;
            }
            if (teleport) {
                const prefixPath = path.slice(0, teleport.step);
                const suffixPath = path.slice(teleport.step);
                if (!(0, GameEngine_1.isValidPath)(player.position, prefixPath, hasGuard ? 0 : pathPoints, validationObstacles))
                    return null;
                if (!(0, GameEngine_1.isValidPath)(teleport.target, suffixPath, hasGuard ? 0 : pathPoints, validationObstacles))
                    return null;
            }
            else if (!(0, GameEngine_1.isValidPath)(player.position, path, hasGuard ? 0 : pathPoints, validationObstacles)) {
                return null;
            }
            for (const skill of uniqueSkills) {
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
            const validationObstacles = hasPhaseShift ? [] : this.obstacles;
            if (!(0, GameEngine_1.isValidPath)(segmentStart, prefixSegment, pathPoints, validationObstacles)) {
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
                if (validationObstacles.some((obstacle) => obstacle.row === target.row && obstacle.col === target.col)) {
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
        const validationObstacles = hasPhaseShift ? [] : this.obstacles;
        if (!(0, GameEngine_1.isValidPath)(segmentStart, suffix, pathPoints, validationObstacles)) {
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
            previousTurnStart: player.previousTurnStart,
            previousTurnPath: player.previousTurnPath,
            equippedSkills: player.equippedSkills,
            timeRewindUsed: player.timeRewindUsed,
        };
    }
    currentPathPoints() {
        if (this.trainingMode) {
            return TRAINING_PATH_POINTS;
        }
        const hasDisconnectedHuman = [...this.players.values()].some((player) => player.connected === false && !player.isBot);
        return hasDisconnectedHuman ? 30 : (0, GameEngine_1.calcPathPoints)(this.turn);
    }
    planBotTurn(bot, opponent) {
        if (this.trainingMode) {
            bot.pathSubmitted = true;
            bot.plannedPath = [];
            bot.plannedSkills = [];
            return;
        }
        const pathPoints = this.currentPathPoints();
        const candidate = this.chooseBotAction(bot, opponent, pathPoints);
        const validated = this.validatePlan(bot, candidate.path, candidate.skills) ?? {
            path: [],
            skills: [],
        };
        bot.plannedPath = validated.path;
        bot.plannedSkills = validated.skills;
        bot.pathSubmitted = true;
        if (ABILITY_FAKE_AI_DEBUG_LOG) {
            console.debug('[ability-fake-ai]', {
                bot: bot.nickname,
                role: bot.role,
                equippedSkills: bot.equippedSkills,
                mana: bot.mana,
                selectedSkill: validated.skills[0]?.skillId ?? candidate.selectedSkill ?? null,
                reason: candidate.reason,
                path: validated.path,
                skills: validated.skills,
            });
        }
    }
    chooseBotAction(bot, opponent, pathPoints) {
        const selfModel = buildBotPathModel({
            start: bot.position,
            opponent: opponent.position,
            role: bot.role === 'attacker' ? 'attacker' : 'escaper',
            pathPoints,
            obstacles: this.obstacles,
        });
        const opponentModel = buildBotPathModel({
            start: opponent.position,
            opponent: bot.position,
            role: bot.role === 'attacker' ? 'escaper' : 'attacker',
            pathPoints,
            obstacles: this.obstacles,
        });
        const candidates = selfModel.paths
            .slice(0, 5)
            .map((path, index) => ({
            path,
            skills: [],
            score: bot.role === 'attacker'
                ? scoreAttackPathAgainstModel(bot.position, path, opponent.position, opponentModel, this.obstacles)
                : scoreEscapePathAgainstModel(bot.position, path, opponent.position, opponentModel, this.obstacles),
            reason: index === 0 ? 'base-primary' : 'base-alt',
            selectedSkill: null,
        }));
        const activeSkillCandidates = this.buildBotSkillActionCandidates(bot, opponent, pathPoints, selfModel, opponentModel);
        candidates.push(...activeSkillCandidates);
        candidates.sort((left, right) => right.score - left.score);
        return candidates[0] ?? {
            path: [],
            skills: [],
            score: 0,
            reason: 'fallback-empty',
            selectedSkill: null,
        };
    }
    buildBotSkillActionCandidates(bot, opponent, pathPoints, selfModel, opponentModel) {
        const candidates = [];
        const basePaths = selfModel.paths.slice(0, 5);
        for (const skillId of bot.equippedSkills) {
            if (!ABILITY_FAKE_AI_SKILL_POOL.includes(skillId))
                continue;
            if (bot.mana < AbilityTypes_1.ABILITY_SKILL_COSTS[skillId])
                continue;
            const serverRule = AbilityTypes_1.ABILITY_SKILL_SERVER_RULES[skillId];
            if ((serverRule.roleRestriction === 'attacker' && bot.role !== 'attacker') ||
                (serverRule.roleRestriction === 'escaper' && bot.role !== 'escaper')) {
                continue;
            }
            if (skillId === 'chronos_time_rewind')
                continue;
            if (skillId === 'classic_guard') {
                const danger = scoreEscapePathAgainstModel(bot.position, [], opponent.position, opponentModel, this.obstacles);
                candidates.push({
                    path: [],
                    skills: [{ skillId, step: 0, order: 0 }],
                    score: danger + 140,
                    reason: 'guard-life-saving',
                    selectedSkill: skillId,
                });
                continue;
            }
            if (skillId === 'arc_reactor_field') {
                const likelyAttackThreat = bot.hp <= 2 || opponent.role === 'attacker' || opponent.mana >= 4;
                const basePath = basePaths[0] ?? [];
                candidates.push({
                    path: basePath,
                    skills: [{ skillId, step: 0, order: 0 }],
                    score: scoreEscapePathAgainstModel(bot.position, basePath, opponent.position, opponentModel, this.obstacles) + (likelyAttackThreat ? 110 : 24),
                    reason: 'at-field-threat-check',
                    selectedSkill: skillId,
                });
                continue;
            }
            if (skillId === 'quantum_shift') {
                for (const target of getAdjacentBlinkTargets(bot.position, this.obstacles, opponent.position)) {
                    const blinkPath = (0, AiPlanner_1.createAiPath)({
                        color: bot.color,
                        role: bot.role,
                        selfPosition: target,
                        opponentPosition: opponent.position,
                        pathPoints,
                        obstacles: this.obstacles,
                    });
                    candidates.push(this.scoreBotActionCandidate(bot, opponent, blinkPath, [
                        { skillId, step: 0, order: 0, target },
                    ], opponentModel, `quantum_shift:${target.row},${target.col}`));
                }
                continue;
            }
            if (skillId === 'electric_blitz') {
                const directBlitzTarget = getBlitzDirectionTowardOpponent(bot.position, opponent.position);
                for (const target of getCardinalNeighbors(bot.position, [])) {
                    const blitzPath = buildBlitzPath(bot.position, target);
                    if (blitzPath.length === 0)
                        continue;
                    const interceptBonus = bot.role === 'attacker' &&
                        directBlitzTarget &&
                        posEqual(target, directBlitzTarget)
                        ? 320
                        : 0;
                    const baseCandidate = this.scoreBotActionCandidate(bot, opponent, blitzPath, [{ skillId, step: 0, order: 0, target }], opponentModel, `electric_blitz:${target.row},${target.col}`);
                    candidates.push({
                        ...baseCandidate,
                        score: baseCandidate.score + interceptBonus,
                    });
                }
                continue;
            }
            if (skillId === 'cosmic_bigbang') {
                const pressure = opponent.hp <= 2 ? 260 : opponent.hp <= 3 ? 90 : -80;
                candidates.push({
                    path: [],
                    skills: [{ skillId, step: 0, order: 0 }],
                    score: pressure,
                    reason: 'cosmic_bigbang-finish-check',
                    selectedSkill: skillId,
                });
                continue;
            }
            if (skillId === 'atomic_fission') {
                if (!bot.previousTurnStart || bot.previousTurnPath.length === 0)
                    continue;
                const shadowCoverage = this.scorePathCoverageAgainstModel(bot.previousTurnStart, bot.previousTurnPath, opponent.position, opponentModel);
                const path = basePaths[0] ?? [];
                candidates.push({
                    path,
                    skills: [{ skillId, step: 0, order: 0 }],
                    score: this.scorePathCoverageAgainstModel(bot.position, path, opponent.position, opponentModel) +
                        shadowCoverage * 0.9 +
                        24,
                    reason: 'atomic_fission-shadow-pressure',
                    selectedSkill: skillId,
                });
                continue;
            }
            if (skillId === 'sun_chariot') {
                for (const path of basePaths.slice(0, 3)) {
                    const sunCoverage = this.scoreExpandedCoverageAgainstModel(bot.position, path, opponent.position, opponentModel);
                    candidates.push({
                        path,
                        skills: [{ skillId, step: 0, order: 0 }],
                        score: sunCoverage + 50,
                        reason: 'sun_chariot-area-pressure',
                        selectedSkill: skillId,
                    });
                }
                continue;
            }
            if (skillId === 'wizard_magic_mine') {
                for (const path of basePaths.slice(0, 3)) {
                    for (let step = 0; step <= path.length; step += 1) {
                        const position = getSequencePosition(bot.position, path, step);
                        const trapValue = (opponentModel.heatmap.get(toKey(position)) ?? 0) * 28 +
                            (opponentModel.timeHeatmap.get(`${step}:${toKey(position)}`) ?? 0) *
                                32;
                        candidates.push({
                            path,
                            skills: [{ skillId, step, order: 0 }],
                            score: this.scorePathCoverageAgainstModel(bot.position, path, opponent.position, opponentModel) +
                                trapValue,
                            reason: `magic_mine:${step}`,
                            selectedSkill: skillId,
                        });
                    }
                }
                continue;
            }
            if (skillId === 'inferno_field') {
                for (const path of basePaths.slice(0, 3)) {
                    for (const target of opponentModel.hotspotCells.slice(0, 5)) {
                        const origin = getSequencePosition(bot.position, path, 0);
                        if (posEqual(origin, target))
                            continue;
                        const lavaValue = (opponentModel.heatmap.get(toKey(target)) ?? 0) * 26 +
                            (opponentModel.timeHeatmap.get(`1:${toKey(target)}`) ?? 0) * 18;
                        candidates.push({
                            path,
                            skills: [{ skillId, step: 0, order: 0, target }],
                            score: this.scorePathCoverageAgainstModel(bot.position, path, opponent.position, opponentModel) +
                                lavaValue,
                            reason: `inferno_field:${target.row},${target.col}`,
                            selectedSkill: skillId,
                        });
                    }
                }
                continue;
            }
            if (skillId === 'ember_blast' || skillId === 'nova_blast') {
                for (const path of basePaths.slice(0, 3)) {
                    for (let step = 0; step <= path.length; step += 1) {
                        const origin = getSequencePosition(bot.position, path, step);
                        const affected = skillId === 'ember_blast'
                            ? getCrossPositions(origin)
                            : getNovaPositions(origin);
                        const aoeScore = this.scoreAreaAgainstModel(affected, opponentModel, step);
                        candidates.push({
                            path,
                            skills: [{ skillId, step, order: 0 }],
                            score: this.scorePathCoverageAgainstModel(bot.position, path, opponent.position, opponentModel) +
                                aoeScore,
                            reason: `${skillId}:${step}`,
                            selectedSkill: skillId,
                        });
                    }
                }
            }
        }
        return candidates
            .map((candidate) => this.validatePlan(bot, candidate.path, candidate.skills)
            ? candidate
            : null)
            .filter((candidate) => !!candidate)
            .sort((left, right) => right.score - left.score)
            .slice(0, 18);
    }
    scoreBotActionCandidate(bot, opponent, path, skills, opponentModel, reason) {
        const score = bot.role === 'attacker'
            ? this.scorePathCoverageAgainstModel(bot.position, path, opponent.position, opponentModel)
            : scoreEscapePathAgainstModel(bot.position, path, opponent.position, opponentModel, this.obstacles);
        return {
            path,
            skills,
            score,
            reason,
            selectedSkill: skills[0]?.skillId ?? null,
        };
    }
    scorePathCoverageAgainstModel(start, path, opponentStart, model) {
        return scoreAttackPathAgainstModel(start, path, opponentStart, model, this.obstacles);
    }
    scoreExpandedCoverageAgainstModel(start, path, opponentStart, model) {
        const sequence = [start, ...path];
        let score = 0;
        for (let index = 0; index < sequence.length; index += 1) {
            const covered = getSquarePositions(sequence[index], 1);
            score += this.scoreAreaAgainstModel(covered, model, index);
        }
        score += this.scorePathCoverageAgainstModel(start, path, opponentStart, model);
        return score;
    }
    scoreAreaAgainstModel(positions, model, step) {
        return positions.reduce((sum, position) => {
            return (sum +
                (model.heatmap.get(toKey(position)) ?? 0) * 22 +
                (model.timeHeatmap.get(`${step}:${toKey(position)}`) ?? 0) * 26);
        }, 0);
    }
    recordTurnSnapshot(player) {
        const existingIndex = player.turnHistory.findIndex((snapshot) => snapshot.turn === this.turn);
        const nextSnapshot = {
            turn: this.turn,
            position: { ...player.position },
            hp: player.hp,
        };
        if (existingIndex >= 0) {
            player.turnHistory[existingIndex] = nextSnapshot;
        }
        else {
            player.turnHistory.push(nextSnapshot);
        }
        if (player.turnHistory.length > 3) {
            player.turnHistory = player.turnHistory.slice(player.turnHistory.length - 3);
        }
    }
    getTimeRewindSnapshot(player) {
        if (player.turnHistory.length === 0)
            return null;
        return player.turnHistory[player.turnHistory.length - 1] ?? null;
    }
    findLethalStep(color, payload) {
        let lethalStep = null;
        for (const collision of payload.collisions) {
            if (collision.escapeeColor !== color || collision.newHp > 0)
                continue;
            lethalStep = collision.step;
        }
        for (const event of payload.skillEvents) {
            const lethalDamage = event.damages?.some((damage) => damage.color === color && damage.newHp <= 0);
            if (!lethalDamage)
                continue;
            lethalStep = event.step;
        }
        return lethalStep;
    }
    applyTimeRewindIfNeeded(color, player, resolution) {
        const nextState = color === 'red' ? resolution.redState : resolution.blueState;
        if (nextState.hp > 0)
            return;
        if (player.timeRewindUsed)
            return;
        if (!player.equippedSkills.includes('chronos_time_rewind'))
            return;
        const rewindSnapshot = this.getTimeRewindSnapshot(player);
        if (!rewindSnapshot)
            return;
        const lethalStep = this.findLethalStep(color, resolution.payload);
        if (lethalStep === null)
            return;
        player.timeRewindUsed = true;
        const path = color === 'red' ? resolution.payload.redPath : resolution.payload.bluePath;
        const turnStart = color === 'red' ? resolution.payload.redStart : resolution.payload.blueStart;
        const finalStep = Math.max(resolution.payload.redPath.length, resolution.payload.bluePath.length);
        const rewindFrom = path.length > 0
            ? { ...path[path.length - 1] }
            : { ...turnStart };
        const traversedPath = [...path].reverse();
        nextState.position = { ...rewindSnapshot.position };
        nextState.hp = rewindSnapshot.hp;
        resolution.payload.skillEvents.push({
            step: finalStep,
            order: 999,
            color,
            skillId: 'chronos_time_rewind',
            from: rewindFrom,
            to: { ...rewindSnapshot.position },
            affectedPositions: traversedPath.map((position) => ({ ...position })),
            rewindHp: rewindSnapshot.hp,
        });
        const redHp = resolution.redState.hp;
        const blueHp = resolution.blueState.hp;
        resolution.winner =
            redHp <= 0 && blueHp <= 0
                ? 'draw'
                : redHp <= 0
                    ? 'blue'
                    : blueHp <= 0
                        ? 'red'
                        : null;
    }
    resetPlayers() {
        const initial = (0, GameEngine_1.getInitialPositions)();
        for (const [color, player] of this.players.entries()) {
            player.hp = ABILITY_STARTING_HP;
            player.position =
                this.trainingMode && player.isBot
                    ? { ...TRAINING_DUMMY_POSITION }
                    : { ...initial[color] };
            player.plannedPath = [];
            player.previousTurnStart = null;
            player.previousTurnPath = [];
            player.plannedSkills = [];
            player.pathSubmitted = false;
            player.mana = this.trainingMode ? TRAINING_STARTING_MANA : INITIAL_MANA;
            player.invulnerableSteps = 0;
            player.pendingManaBonus = 0;
            player.pendingOverdriveStage = 0;
            player.pendingVoidCloak = false;
            player.overdriveActive = false;
            player.reboundLocked = false;
            player.hidden = false;
            player.timeRewindUsed = false;
            player.turnHistory = [];
            player.disconnectLossRecorded = false;
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
        this.trapTiles = [];
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
