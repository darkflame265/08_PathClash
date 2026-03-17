"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TWO_VS_TWO_SLOTS = void 0;
exports.getTwoVsTwoInitialPositions = getTwoVsTwoInitialPositions;
exports.getSlotTeam = getSlotTeam;
exports.calcTwoVsTwoPathPoints = calcTwoVsTwoPathPoints;
exports.isValidTwoVsTwoPath = isValidTwoVsTwoPath;
exports.generateTwoVsTwoObstacles = generateTwoVsTwoObstacles;
exports.resolveTwoVsTwoMovement = resolveTwoVsTwoMovement;
const GameEngine_1 = require("../GameEngine");
const GRID_MIN = 0;
const GRID_MAX = 4;
const DIRECTIONS = [
    { row: -1, col: 0 },
    { row: 1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
];
const MIN_OPEN_DIRECTIONS = 2;
const MAX_OBSTACLES = 4;
exports.TWO_VS_TWO_SLOTS = [
    'red_top',
    'red_bottom',
    'blue_top',
    'blue_bottom',
];
function getTwoVsTwoInitialPositions() {
    return {
        red_top: { row: 1, col: 0 },
        red_bottom: { row: 3, col: 0 },
        blue_top: { row: 1, col: 4 },
        blue_bottom: { row: 3, col: 4 },
    };
}
function getSlotTeam(slot) {
    return slot.startsWith('red') ? 'red' : 'blue';
}
function calcTwoVsTwoPathPoints(turn) {
    return (0, GameEngine_1.calcPathPoints)(turn);
}
function isValidTwoVsTwoPath(start, path, maxPoints, obstacles = []) {
    if (path.length > maxPoints)
        return false;
    let current = start;
    for (const next of path) {
        if (!isWithinGrid(next))
            return false;
        if (isObstacle(next, obstacles))
            return false;
        if (!(0, GameEngine_1.isValidMove)(current, next))
            return false;
        current = next;
    }
    return true;
}
function generateTwoVsTwoObstacles(matchId, turn, playerPositions, obstacleCount = MAX_OBSTACLES) {
    const occupied = new Set(Object.values(playerPositions).map((position) => toKey(position)));
    const candidates = [];
    for (let row = GRID_MIN; row <= GRID_MAX; row++) {
        for (let col = GRID_MIN; col <= GRID_MAX; col++) {
            const cell = { row, col };
            if (occupied.has(toKey(cell)))
                continue;
            candidates.push(cell);
        }
    }
    const random = createSeededRandom(`${matchId}:${turn}:2v2`);
    const shuffled = shuffleCandidates(candidates, random);
    const picked = pickObstacleLayout(shuffled, playerPositions, obstacleCount);
    return picked ?? shuffled.slice(0, obstacleCount);
}
function resolveTwoVsTwoMovement(params) {
    const sequences = Object.fromEntries(exports.TWO_VS_TWO_SLOTS.map((slot) => [slot, [params.starts[slot], ...params.paths[slot]]]));
    const currentHp = { ...params.hps };
    const playerHits = [];
    const maxSteps = Math.max(1, ...exports.TWO_VS_TWO_SLOTS.map((slot) => sequences[slot].length));
    const attackerSlots = exports.TWO_VS_TWO_SLOTS.filter((slot) => getSlotTeam(slot) === params.attackerTeam);
    const escaperSlots = exports.TWO_VS_TWO_SLOTS.filter((slot) => getSlotTeam(slot) !== params.attackerTeam);
    for (let step = 0; step < maxSteps; step++) {
        const currentPositions = Object.fromEntries(exports.TWO_VS_TWO_SLOTS.map((slot) => [
            slot,
            sequences[slot][Math.min(step, sequences[slot].length - 1)],
        ]));
        const previousPositions = Object.fromEntries(exports.TWO_VS_TWO_SLOTS.map((slot) => [
            slot,
            sequences[slot][Math.max(0, Math.min(step - 1, sequences[slot].length - 1))],
        ]));
        for (const attackerSlot of attackerSlots) {
            for (const escaperSlot of escaperSlots) {
                if (currentHp[attackerSlot] <= 0 || currentHp[escaperSlot] <= 0)
                    continue;
                if (positionsTouch(currentPositions[attackerSlot], previousPositions[attackerSlot], currentPositions[escaperSlot], previousPositions[escaperSlot])) {
                    currentHp[escaperSlot] = Math.max(0, currentHp[escaperSlot] - 1);
                    playerHits.push({
                        step,
                        slot: escaperSlot,
                        newHp: currentHp[escaperSlot],
                    });
                }
            }
        }
    }
    const ends = Object.fromEntries(exports.TWO_VS_TWO_SLOTS.map((slot) => [slot, sequences[slot][sequences[slot].length - 1]]));
    return {
        ends,
        hps: currentHp,
        playerHits,
    };
}
function positionsHaveEnoughOpenDirections(playerPositions, obstacles) {
    return exports.TWO_VS_TWO_SLOTS.every((slot) => countOpenDirections(playerPositions[slot], obstacles) >= MIN_OPEN_DIRECTIONS);
}
function pickObstacleLayout(candidates, playerPositions, obstacleCount) {
    const picked = [];
    const pickedKeys = new Set();
    const search = (startIndex) => {
        if (!positionsHaveEnoughOpenDirections(playerPositions, picked))
            return false;
        if (picked.length === obstacleCount)
            return true;
        const remainingSlots = obstacleCount - picked.length;
        for (let index = startIndex; index <= candidates.length - remainingSlots; index++) {
            const candidate = candidates[index];
            const key = toKey(candidate);
            if (pickedKeys.has(key))
                continue;
            picked.push(candidate);
            pickedKeys.add(key);
            if (search(index + 1))
                return true;
            picked.pop();
            pickedKeys.delete(key);
        }
        return false;
    };
    return search(0) ? [...picked] : null;
}
function countOpenDirections(position, obstacles) {
    let count = 0;
    for (const offset of DIRECTIONS) {
        const next = { row: position.row + offset.row, col: position.col + offset.col };
        if (!isWithinGrid(next))
            continue;
        if (isObstacle(next, obstacles))
            continue;
        count += 1;
    }
    return count;
}
function positionsTouch(aNow, aPrev, bNow, bPrev) {
    return samePosition(aNow, bNow) || (samePosition(aNow, bPrev) && samePosition(bNow, aPrev));
}
function samePosition(a, b) {
    return a.row === b.row && a.col === b.col;
}
function isWithinGrid(position) {
    return (position.row >= GRID_MIN &&
        position.row <= GRID_MAX &&
        position.col >= GRID_MIN &&
        position.col <= GRID_MAX);
}
function isObstacle(cell, obstacles) {
    return obstacles.some((obstacle) => obstacle.row === cell.row && obstacle.col === cell.col);
}
function shuffleCandidates(candidates, random) {
    const shuffled = [...candidates];
    for (let index = shuffled.length - 1; index > 0; index--) {
        const swapIndex = Math.floor(random() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
    }
    return shuffled;
}
function toKey(position) {
    return `${position.row},${position.col}`;
}
function createSeededRandom(seedInput) {
    let seed = hashString(seedInput);
    return () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 0x100000000;
    };
}
function hashString(value) {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}
