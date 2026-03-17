"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calcPathPoints = calcPathPoints;
exports.isValidMove = isValidMove;
exports.isValidPath = isValidPath;
exports.generateObstacles = generateObstacles;
exports.detectCollisions = detectCollisions;
exports.getInitialPositions = getInitialPositions;
exports.calcAnimationDuration = calcAnimationDuration;
exports.toClientPlayer = toClientPlayer;
exports.isObstacle = isObstacle;
const GRID_MIN = 0;
const GRID_MAX = 4;
const MAX_OBSTACLES = 4;
const MIN_OPEN_DIRECTIONS = 2;
function calcPathPoints(turn) {
    return Math.min(4 + turn, 10);
}
function isValidMove(from, to) {
    const dr = Math.abs(to.row - from.row);
    const dc = Math.abs(to.col - from.col);
    return (dr + dc === 1 &&
        to.row >= GRID_MIN && to.row <= GRID_MAX &&
        to.col >= GRID_MIN && to.col <= GRID_MAX);
}
function isValidPath(start, path, maxPoints, obstacles = []) {
    if (path.length > maxPoints)
        return false;
    let cur = start;
    for (const next of path) {
        if (isObstacle(next, obstacles))
            return false;
        if (!isValidMove(cur, next))
            return false;
        cur = next;
    }
    return true;
}
function generateObstacles(matchId, turn, redPosition, bluePosition, obstacleCount = MAX_OBSTACLES) {
    const occupied = new Set([toKey(redPosition), toKey(bluePosition)]);
    const candidates = [];
    for (let row = GRID_MIN; row <= GRID_MAX; row++) {
        for (let col = GRID_MIN; col <= GRID_MAX; col++) {
            const cell = { row, col };
            if (occupied.has(toKey(cell)))
                continue;
            candidates.push(cell);
        }
    }
    const random = createSeededRandom(`${matchId}:${turn}`);
    const shuffledCandidates = shuffleCandidates(candidates, random);
    const picked = pickObstacleLayout(shuffledCandidates, redPosition, bluePosition, obstacleCount);
    return picked ?? shuffledCandidates.slice(0, obstacleCount);
}
function detectCollisions(redPath, bluePath, redStart, blueStart, attackerColor, escaperHp) {
    const events = [];
    const escapeeColor = attackerColor === 'red' ? 'blue' : 'red';
    const escaperPath = escapeeColor === 'red' ? redPath : bluePath;
    const startsOverlapped = redStart.row === blueStart.row && redStart.col === blueStart.col;
    const ignoreStartTileCollision = startsOverlapped && escaperPath.length > 0;
    const redSeq = [redStart, ...redPath];
    const blueSeq = [blueStart, ...bluePath];
    const maxLen = Math.max(redSeq.length, blueSeq.length);
    let currentHp = escaperHp;
    for (let i = 0; i < maxLen; i++) {
        const r = redSeq[Math.min(i, redSeq.length - 1)];
        const b = blueSeq[Math.min(i, blueSeq.length - 1)];
        // Same cell collision
        if (r.row === b.row && r.col === b.col) {
            if (i === 0 && ignoreStartTileCollision) {
                continue;
            }
            currentHp = Math.max(0, currentHp - 1);
            events.push({ step: i, position: r, escapeeColor, newHp: currentHp });
            continue;
        }
        // Swap/cross collision (between step i-1 and i)
        if (i > 0) {
            const rPrev = redSeq[Math.min(i - 1, redSeq.length - 1)];
            const bPrev = blueSeq[Math.min(i - 1, blueSeq.length - 1)];
            if (r.row === bPrev.row && r.col === bPrev.col &&
                b.row === rPrev.row && b.col === rPrev.col) {
                currentHp = Math.max(0, currentHp - 1);
                events.push({ step: i, position: r, escapeeColor, newHp: currentHp });
            }
        }
    }
    return events;
}
function getInitialPositions() {
    return {
        red: { row: 2, col: 0 },
        blue: { row: 2, col: 4 },
    };
}
function calcAnimationDuration(pathLength) {
    // 200ms per step + 300ms buffer
    return pathLength * 200 + 300;
}
function toClientPlayer(p) {
    const { socketId: _s, ...rest } = p;
    return rest;
}
function isObstacle(cell, obstacles) {
    return obstacles.some((obstacle) => obstacle.row === cell.row && obstacle.col === cell.col);
}
function pickObstacleLayout(candidates, redPosition, bluePosition, obstacleCount) {
    const picked = [];
    const pickedKeys = new Set();
    const search = (startIndex) => {
        if (!positionsHaveEnoughOpenDirections(redPosition, bluePosition, picked)) {
            return false;
        }
        if (picked.length === obstacleCount) {
            return true;
        }
        const remainingSlots = obstacleCount - picked.length;
        for (let index = startIndex; index <= candidates.length - remainingSlots; index++) {
            const candidate = candidates[index];
            const candidateKey = toKey(candidate);
            if (pickedKeys.has(candidateKey))
                continue;
            picked.push(candidate);
            pickedKeys.add(candidateKey);
            if (search(index + 1)) {
                return true;
            }
            picked.pop();
            pickedKeys.delete(candidateKey);
        }
        return false;
    };
    return search(0) ? [...picked] : null;
}
function positionsHaveEnoughOpenDirections(redPosition, bluePosition, obstacles) {
    return (countOpenDirections(redPosition, obstacles) >= MIN_OPEN_DIRECTIONS &&
        countOpenDirections(bluePosition, obstacles) >= MIN_OPEN_DIRECTIONS);
}
function countOpenDirections(position, obstacles) {
    let count = 0;
    for (const offset of DIRECTIONS) {
        const next = {
            row: position.row + offset.row,
            col: position.col + offset.col,
        };
        if (!isWithinGrid(next))
            continue;
        if (isObstacle(next, obstacles))
            continue;
        count += 1;
    }
    return count;
}
function isWithinGrid(position) {
    return (position.row >= GRID_MIN &&
        position.row <= GRID_MAX &&
        position.col >= GRID_MIN &&
        position.col <= GRID_MAX);
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
const DIRECTIONS = [
    { row: -1, col: 0 },
    { row: 1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
];
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
