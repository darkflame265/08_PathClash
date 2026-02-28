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
const MAX_OBSTACLES = 3;
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
function generateObstacles(redPosition, bluePosition) {
    const occupied = new Set([toKey(redPosition), toKey(bluePosition)]);
    const candidates = [];
    const rowMin = Math.min(redPosition.row, bluePosition.row);
    const rowMax = Math.max(redPosition.row, bluePosition.row);
    const colMin = Math.min(redPosition.col, bluePosition.col);
    const colMax = Math.max(redPosition.col, bluePosition.col);
    for (let row = GRID_MIN; row <= GRID_MAX; row++) {
        for (let col = GRID_MIN; col <= GRID_MAX; col++) {
            const cell = { row, col };
            const key = toKey(cell);
            if (occupied.has(key))
                continue;
            if (!isBetweenPlayers(cell, redPosition, bluePosition, rowMin, rowMax, colMin, colMax))
                continue;
            candidates.push(cell);
        }
    }
    shuffle(candidates);
    return candidates.slice(0, Math.min(MAX_OBSTACLES, candidates.length));
}
function detectCollisions(redPath, bluePath, redStart, blueStart, attackerColor, escaperHp) {
    const events = [];
    const escapeeColor = attackerColor === 'red' ? 'blue' : 'red';
    const redSeq = [redStart, ...redPath];
    const blueSeq = [blueStart, ...bluePath];
    const maxLen = Math.max(redSeq.length, blueSeq.length);
    let currentHp = escaperHp;
    for (let i = 0; i < maxLen; i++) {
        const r = redSeq[Math.min(i, redSeq.length - 1)];
        const b = blueSeq[Math.min(i, blueSeq.length - 1)];
        // Same cell collision
        if (r.row === b.row && r.col === b.col) {
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
function isBetweenPlayers(cell, redPosition, bluePosition, rowMin, rowMax, colMin, colMax) {
    const withinBox = cell.row >= rowMin && cell.row <= rowMax && cell.col >= colMin && cell.col <= colMax;
    const betweenDistance = manhattan(redPosition, cell) + manhattan(cell, bluePosition) === manhattan(redPosition, bluePosition);
    return withinBox || betweenDistance;
}
function manhattan(a, b) {
    return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}
function toKey(position) {
    return `${position.row},${position.col}`;
}
function shuffle(items) {
    for (let i = items.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [items[i], items[j]] = [items[j], items[i]];
    }
}
