"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAiPath = createAiPath;
const GameEngine_1 = require("./GameEngine");
const DIRECTIONS = [
    { row: -1, col: 0 },
    { row: 1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
];
function createAiPath(params) {
    const { role } = params;
    return role === 'attacker'
        ? createAttackerPath(params.selfPosition, params.opponentPosition, params.pathPoints, params.obstacles)
        : createEscaperPath(params.selfPosition, params.opponentPosition, params.pathPoints, params.obstacles);
}
function createAttackerPath(selfPosition, targetPosition, pathPoints, obstacles) {
    const path = buildShortestPath(selfPosition, targetPosition, obstacles).slice(0, pathPoints);
    if (path.length === pathPoints)
        return path;
    let current = path.length > 0 ? path[path.length - 1] : selfPosition;
    let previous = path.length > 1 ? path[path.length - 2] : null;
    while (path.length < pathPoints) {
        const nextMove = chooseAttackerExtension(current, previous, targetPosition, obstacles);
        if (!nextMove)
            break;
        path.push(nextMove);
        previous = current;
        current = nextMove;
    }
    return path;
}
function createEscaperPath(selfPosition, threatPosition, pathPoints, obstacles) {
    const maxSpend = Math.max(1, pathPoints);
    const spend = Math.floor(Math.random() * maxSpend) + 1;
    const path = [];
    let current = selfPosition;
    let previous = null;
    for (let step = 0; step < spend; step++) {
        const candidates = getNeighbors(current, obstacles).filter((candidate) => !isSamePosition(candidate, previous));
        if (candidates.length === 0)
            break;
        const scored = candidates
            .map((candidate) => ({
            candidate,
            score: scoreEscaperMove(candidate, threatPosition, previous),
        }))
            .sort((a, b) => b.score - a.score);
        const topScore = scored[0]?.score ?? 0;
        const topMoves = scored.filter((item) => item.score >= topScore - 1.5);
        const choice = topMoves[Math.floor(Math.random() * topMoves.length)]?.candidate;
        if (!choice)
            break;
        path.push(choice);
        previous = current;
        current = choice;
    }
    return path;
}
function scoreEscaperMove(candidate, threat, previous) {
    const distance = manhattan(candidate, threat);
    const edgePenalty = isEdge(candidate) ? 0.5 : 0;
    const centerBias = isEdge(candidate) ? 0 : 0.35;
    return distance * 10 - edgePenalty + centerBias + Math.random();
}
function buildShortestPath(from, to, obstacles) {
    const startKey = toKey(from);
    const targetKey = toKey(to);
    const queue = [{ ...from }];
    const visited = new Set([startKey]);
    const previous = new Map();
    const positionMap = new Map([[startKey, { ...from }]]);
    while (queue.length > 0) {
        const current = queue.shift();
        const currentKey = toKey(current);
        if (currentKey === targetKey)
            break;
        for (const next of getNeighbors(current, obstacles)) {
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
    while (cursor !== startKey) {
        const pos = positionMap.get(cursor);
        if (!pos)
            break;
        reversedPath.push(pos);
        cursor = previous.get(cursor);
    }
    return reversedPath.reverse();
}
function chooseAttackerExtension(current, previous, target, obstacles) {
    const candidates = getNeighbors(current, obstacles).filter((candidate) => !isSamePosition(candidate, previous));
    if (candidates.length === 0)
        return null;
    candidates.sort((a, b) => manhattan(a, target) - manhattan(b, target));
    const bestDistance = manhattan(candidates[0], target);
    const bestMoves = candidates.filter((candidate) => manhattan(candidate, target) === bestDistance);
    return bestMoves[Math.floor(Math.random() * bestMoves.length)] ?? null;
}
function getNeighbors(position, obstacles) {
    return DIRECTIONS
        .map((direction) => ({
        row: position.row + direction.row,
        col: position.col + direction.col,
    }))
        .filter((next) => (0, GameEngine_1.isValidMove)(position, next) && !isBlocked(next, obstacles));
}
function manhattan(a, b) {
    return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}
function isEdge(position) {
    return position.row === 0 || position.row === 4 || position.col === 0 || position.col === 4;
}
function isSamePosition(a, b) {
    return !!b && a.row === b.row && a.col === b.col;
}
function isBlocked(position, obstacles) {
    return obstacles.some((obstacle) => isSamePosition(position, obstacle));
}
function toKey(position) {
    return `${position.row},${position.col}`;
}
