"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.calcCoopPathPoints = calcCoopPathPoints;
exports.createCoopPortalBatch = createCoopPortalBatch;
exports.createEnemyPreviews = createEnemyPreviews;
exports.resolveCoopMovement = resolveCoopMovement;
exports.isValidCoopPath = isValidCoopPath;
exports.portalColorFromHp = portalColorFromHp;
const AiPlanner_1 = require("../AiPlanner");
const GameEngine_1 = require("../GameEngine");
const GRID_MIN = 0;
const GRID_MAX = 4;
const DIRECTIONS = [
    { row: -1, col: 0 },
    { row: 1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
];
const PORTAL_HP_WEIGHTS = [
    { hp: 1, weight: 0.6 },
    { hp: 2, weight: 0.3 },
    { hp: 3, weight: 0.1 },
];
function calcCoopPathPoints(round) {
    return (0, GameEngine_1.calcPathPoints)(round);
}
function createCoopPortalBatch(params) {
    const random = params.random ?? Math.random;
    const blocked = new Set(params.occupied.map(toKey));
    const candidates = [];
    for (let row = GRID_MIN; row <= GRID_MAX; row++) {
        for (let col = GRID_MIN; col <= GRID_MAX; col++) {
            const position = { row, col };
            if (blocked.has(toKey(position)))
                continue;
            candidates.push(position);
        }
    }
    shuffle(candidates, random);
    return candidates.slice(0, params.count).map((position, index) => {
        const hp = pickPortalHp(random);
        return {
            id: `${params.idPrefix}_portal_${index}`,
            position,
            hp,
            maxHp: hp,
            color: portalColorFromHp(hp),
        };
    });
}
function createEnemyPreviews(params) {
    return params.enemies.map((enemy) => {
        const target = manhattan(enemy.position, params.redPosition) <=
            manhattan(enemy.position, params.bluePosition)
            ? params.redPosition
            : params.bluePosition;
        return {
            id: enemy.id,
            start: enemy.position,
            path: (0, AiPlanner_1.createAiPath)({
                color: 'red',
                role: 'attacker',
                selfPosition: enemy.position,
                opponentPosition: target,
                pathPoints: 4,
                obstacles: params.obstacles ?? [],
            }).slice(0, 4),
        };
    });
}
function resolveCoopMovement(params) {
    const redSeq = [params.redStart, ...params.redPath];
    const blueSeq = [params.blueStart, ...params.bluePath];
    const enemySeqs = params.enemies.map((enemy) => ({
        id: enemy.id,
        seq: [enemy.start, ...enemy.path],
    }));
    const maxSteps = Math.max(redSeq.length, blueSeq.length, ...enemySeqs.map((enemy) => enemy.seq.length), 1);
    let redHp = params.redHp;
    let blueHp = params.blueHp;
    const playerHits = [];
    const portalHits = [];
    const portals = params.portals.map((portal) => ({ ...portal }));
    const destroyedPortalIds = new Set();
    for (let step = 0; step < maxSteps; step++) {
        const redNow = redSeq[Math.min(step, redSeq.length - 1)];
        const blueNow = blueSeq[Math.min(step, blueSeq.length - 1)];
        const redPrev = redSeq[Math.max(0, Math.min(step - 1, redSeq.length - 1))];
        const bluePrev = blueSeq[Math.max(0, Math.min(step - 1, blueSeq.length - 1))];
        for (const enemy of enemySeqs) {
            const enemyNow = enemy.seq[Math.min(step, enemy.seq.length - 1)];
            const enemyPrev = enemy.seq[Math.max(0, Math.min(step - 1, enemy.seq.length - 1))];
            const redStartsOverlapped = samePosition(params.redStart, enemy.seq[0]);
            const blueStartsOverlapped = samePosition(params.blueStart, enemy.seq[0]);
            const ignoreRedStartTileCollision = redStartsOverlapped && params.redPath.length > 0;
            const ignoreBlueStartTileCollision = blueStartsOverlapped && params.bluePath.length > 0;
            if (positionsTouch(redNow, redPrev, enemyNow, enemyPrev)) {
                if (step === 0 && ignoreRedStartTileCollision) {
                    continue;
                }
                redHp = Math.max(0, redHp - 1);
                playerHits.push({ step, color: 'red', newHp: redHp });
            }
            if (positionsTouch(blueNow, bluePrev, enemyNow, enemyPrev)) {
                if (step === 0 && ignoreBlueStartTileCollision) {
                    continue;
                }
                blueHp = Math.max(0, blueHp - 1);
                playerHits.push({ step, color: 'blue', newHp: blueHp });
            }
        }
        for (const portal of portals) {
            if (destroyedPortalIds.has(portal.id))
                continue;
            let damage = 0;
            if (samePosition(redNow, portal.position))
                damage += 1;
            if (samePosition(blueNow, portal.position))
                damage += 1;
            if (damage === 0)
                continue;
            portal.hp = Math.max(0, portal.hp - damage);
            const destroyed = portal.hp <= 0;
            if (destroyed) {
                destroyedPortalIds.add(portal.id);
            }
            portalHits.push({
                step,
                portalId: portal.id,
                newHp: portal.hp,
                destroyed,
            });
        }
    }
    return {
        playerHits,
        portalHits,
        redEnd: redSeq[redSeq.length - 1],
        blueEnd: blueSeq[blueSeq.length - 1],
        remainingPortals: portals.filter((portal) => portal.hp > 0),
        redHp,
        blueHp,
    };
}
function isValidCoopPath(start, path, maxPoints, obstacles = []) {
    if (path.length > maxPoints)
        return false;
    let current = start;
    for (const next of path) {
        if (!isWithinGrid(next))
            return false;
        if (obstacles.some((obstacle) => samePosition(obstacle, next)))
            return false;
        if (!(0, GameEngine_1.isValidMove)(current, next))
            return false;
        current = next;
    }
    return true;
}
function portalColorFromHp(hp) {
    if (hp <= 1)
        return 'green';
    if (hp === 2)
        return 'blue';
    return 'red';
}
function pickPortalHp(random) {
    const roll = random();
    let acc = 0;
    for (const option of PORTAL_HP_WEIGHTS) {
        acc += option.weight;
        if (roll <= acc)
            return option.hp;
    }
    return 1;
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
function manhattan(a, b) {
    return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}
function shuffle(list, random) {
    for (let index = list.length - 1; index > 0; index--) {
        const swapIndex = Math.floor(random() * (index + 1));
        [list[index], list[swapIndex]] = [list[swapIndex], list[index]];
    }
}
function toKey(position) {
    return `${position.row},${position.col}`;
}
