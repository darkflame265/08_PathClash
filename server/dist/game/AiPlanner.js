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
    const rawPath = role === 'attacker'
        ? createAttackerPath(params.selfPosition, params.opponentPosition, params.pathPoints, params.obstacles)
        : createEscaperPath(params.selfPosition, params.opponentPosition, params.pathPoints, params.obstacles);
    return collapseImmediateBacktracks(params.selfPosition, rawPath).slice(0, params.pathPoints);
}
function createAttackerPath(selfPosition, targetPosition, pathPoints, obstacles) {
    const predictedEscapePath = predictEscaperPath(targetPosition, selfPosition, pathPoints, obstacles);
    const predictedTargets = buildInterceptTargets(targetPosition, predictedEscapePath, obstacles);
    const attackTarget = chooseBestInterceptTarget(selfPosition, predictedTargets, targetPosition, pathPoints, obstacles) ?? targetPosition;
    const path = buildShortestPath(selfPosition, attackTarget, obstacles).slice(0, pathPoints);
    if (path.length === pathPoints)
        return path;
    let current = path.length > 0 ? path[path.length - 1] : selfPosition;
    let previous = path.length > 1 ? path[path.length - 2] : null;
    while (path.length < pathPoints) {
        const nextMove = chooseAttackerExtension(current, previous, attackTarget, obstacles);
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
    const predictedThreatPath = predictAttackerPath(threatPosition, selfPosition, pathPoints, obstacles);
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
            score: scoreEscaperMove(candidate, threatPosition, previous, predictedThreatPath, obstacles),
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
function scoreEscaperMove(candidate, threat, previous, predictedThreatPath, obstacles) {
    const distance = manhattan(candidate, threat);
    const edgePenalty = isEdge(candidate) ? 0.5 : 0;
    const centerBias = isEdge(candidate) ? 0 : 0.35;
    const predictedThreatDistance = getMinDistanceToPath(candidate, predictedThreatPath);
    const mobility = countOpenNeighbors(candidate, obstacles);
    const lineTrapPenalty = predictedThreatDistance <= 1 ? 7 : 0;
    const revisitPenalty = isSamePosition(candidate, previous) ? 100 : 0;
    return (distance * 8 +
        predictedThreatDistance * 11 +
        mobility * 1.6 -
        edgePenalty +
        centerBias -
        lineTrapPenalty -
        revisitPenalty +
        Math.random());
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
function predictEscaperPath(escaperPosition, attackerPosition, pathPoints, obstacles) {
    const path = [];
    let current = escaperPosition;
    let previous = null;
    for (let step = 0; step < pathPoints; step++) {
        const candidates = getNeighbors(current, obstacles).filter((candidate) => !isSamePosition(candidate, previous));
        if (candidates.length === 0)
            break;
        const best = candidates
            .map((candidate) => ({
            candidate,
            score: manhattan(candidate, attackerPosition) * 10 +
                countOpenNeighbors(candidate, obstacles) * 1.2 +
                (isEdge(candidate) ? -0.5 : 0.35),
        }))
            .sort((a, b) => b.score - a.score)[0]?.candidate;
        if (!best)
            break;
        path.push(best);
        previous = current;
        current = best;
    }
    return path;
}
function predictAttackerPath(attackerPosition, targetPosition, pathPoints, obstacles) {
    const directPath = buildShortestPath(attackerPosition, targetPosition, obstacles).slice(0, pathPoints);
    if (directPath.length === pathPoints)
        return directPath;
    const path = [...directPath];
    let current = path.length > 0 ? path[path.length - 1] : attackerPosition;
    let previous = path.length > 1 ? path[path.length - 2] : null;
    while (path.length < pathPoints) {
        const next = chooseAttackerExtension(current, previous, targetPosition, obstacles);
        if (!next)
            break;
        path.push(next);
        previous = current;
        current = next;
    }
    return path;
}
function buildInterceptTargets(currentTarget, predictedEscapePath, obstacles) {
    const ordered = [currentTarget, ...predictedEscapePath];
    const extras = predictedEscapePath.flatMap((position) => getNeighbors(position, obstacles));
    const unique = new Map();
    for (const position of [...ordered, ...extras]) {
        unique.set(toKey(position), position);
    }
    return [...unique.values()];
}
function chooseBestInterceptTarget(selfPosition, targets, fallbackTarget, pathPoints, obstacles) {
    const scoredTargets = targets
        .map((target, index) => {
        const path = buildShortestPath(selfPosition, target, obstacles);
        if (path.length === 0 && !isSamePosition(selfPosition, target))
            return null;
        const reachableNow = path.length > 0 && path.length <= pathPoints;
        const distance = path.length === 0 ? 0 : path.length;
        const futureBias = index > 0 ? 1.8 : 0;
        const fallbackDistance = manhattan(target, fallbackTarget);
        return {
            target,
            score: (reachableNow ? 40 : 0) +
                futureBias * 10 -
                distance * 2.2 -
                fallbackDistance * 0.9,
        };
    })
        .filter((entry) => !!entry)
        .sort((a, b) => b.score - a.score);
    return scoredTargets[0]?.target ?? null;
}
function getMinDistanceToPath(position, path) {
    if (path.length === 0)
        return 99;
    return Math.min(...path.map((step) => manhattan(position, step)));
}
function countOpenNeighbors(position, obstacles) {
    return getNeighbors(position, obstacles).length;
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
function collapseImmediateBacktracks(start, path) {
    const normalized = [];
    for (const step of path) {
        const secondLast = normalized.length >= 2
            ? normalized[normalized.length - 2]
            : normalized.length === 1
                ? start
                : null;
        if (secondLast && isSamePosition(step, secondLast)) {
            normalized.pop();
            continue;
        }
        normalized.push(step);
    }
    return normalized;
}
