import { createAiPath } from '../LegacyAiPlanner';
import { calcPathPoints, isValidMove } from '../GameEngine';
import type { PlayerColor, Position } from '../../types/game.types';
import type {
  CoopEnemy,
  CoopEnemyPreview,
  CoopPortal,
  CoopPortalColor,
  CoopPlayerHitEvent,
  CoopPortalHitEvent,
} from './CoopTypes';

const GRID_MIN = 0;
const GRID_MAX = 4;
const DIRECTIONS: Position[] = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
];

const PORTAL_HP_WEIGHTS = [
  { hp: 1, weight: 0.6 },
  { hp: 2, weight: 0.3 },
  { hp: 3, weight: 0.1 },
] as const;

export function calcCoopPathPoints(round: number): number {
  return calcPathPoints(round);
}

export function createCoopPortalBatch(params: {
  count: number;
  occupied: Position[];
  random?: () => number;
  idPrefix: string;
}): CoopPortal[] {
  const random = params.random ?? Math.random;
  const blocked = new Set(params.occupied.map(toKey));
  const candidates: Position[] = [];

  for (let row = GRID_MIN; row <= GRID_MAX; row++) {
    for (let col = GRID_MIN; col <= GRID_MAX; col++) {
      const position = { row, col };
      if (blocked.has(toKey(position))) continue;
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

export function createEnemyPreviews(params: {
  enemies: CoopEnemy[];
  redPosition: Position;
  bluePosition: Position;
  redAlive?: boolean;
  blueAlive?: boolean;
  obstacles?: Position[];
}): CoopEnemyPreview[] {
  return params.enemies.map((enemy) => {
    const target = selectReachableTarget(
      enemy.position,
      params.redPosition,
      params.bluePosition,
      params.redAlive ?? true,
      params.blueAlive ?? true,
      params.obstacles ?? [],
    );

    return {
      id: enemy.id,
      start: enemy.position,
      path: createAiPath({
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

export function createCoopEnemyAttackPath(params: {
  selfPosition: Position;
  redPosition: Position;
  bluePosition: Position;
  redAlive?: boolean;
  blueAlive?: boolean;
  pathPoints: number;
  obstacles?: Position[];
}): Position[] {
  const obstacles = params.obstacles ?? [];
  const target = selectReachableTarget(
    params.selfPosition,
    params.redPosition,
    params.bluePosition,
    params.redAlive ?? true,
    params.blueAlive ?? true,
    obstacles,
  );

  return createAiPath({
    color: 'red',
    role: 'attacker',
    selfPosition: params.selfPosition,
    opponentPosition: target,
    pathPoints: params.pathPoints,
    obstacles,
  }).slice(0, params.pathPoints);
}

export function resolveCoopMovement(params: {
  redStart: Position;
  blueStart: Position;
  redPath: Position[];
  bluePath: Position[];
  enemies: CoopEnemyPreview[];
  portals: CoopPortal[];
  redHp: number;
  blueHp: number;
}) {
  const redSeq = [params.redStart, ...params.redPath];
  const blueSeq = [params.blueStart, ...params.bluePath];
  const enemySeqs = params.enemies.map((enemy) => ({
    id: enemy.id,
    seq: [enemy.start, ...enemy.path],
  }));
  const maxSteps = Math.max(
    redSeq.length,
    blueSeq.length,
    ...enemySeqs.map((enemy) => enemy.seq.length),
    1,
  );

  let redHp = params.redHp;
  let blueHp = params.blueHp;
  const playerHits: CoopPlayerHitEvent[] = [];
  const portalHits: CoopPortalHitEvent[] = [];
  const portals = params.portals.map((portal) => ({ ...portal }));
  const destroyedPortalIds = new Set<string>();

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

      if (redHp > 0 && positionsTouch(redNow, redPrev, enemyNow, enemyPrev)) {
        if (step === 0 && ignoreRedStartTileCollision) {
          continue;
        }
        redHp = Math.max(0, redHp - 1);
        playerHits.push({ step, color: 'red', newHp: redHp });
      }

      if (blueHp > 0 && positionsTouch(blueNow, bluePrev, enemyNow, enemyPrev)) {
        if (step === 0 && ignoreBlueStartTileCollision) {
          continue;
        }
        blueHp = Math.max(0, blueHp - 1);
        playerHits.push({ step, color: 'blue', newHp: blueHp });
      }
    }

    for (const portal of portals) {
      if (destroyedPortalIds.has(portal.id)) continue;
      let damage = 0;
      if (redHp > 0 && samePosition(redNow, portal.position)) damage += 1;
      if (blueHp > 0 && samePosition(blueNow, portal.position)) damage += 1;
      if (damage === 0) continue;

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

export function isValidCoopPath(start: Position, path: Position[], maxPoints: number, obstacles: Position[] = []): boolean {
  if (path.length > maxPoints) return false;
  let current = start;
  for (const next of path) {
    if (!isWithinGrid(next)) return false;
    if (obstacles.some((obstacle) => samePosition(obstacle, next))) return false;
    if (!isValidMove(current, next)) return false;
    current = next;
  }
  return true;
}

export function portalColorFromHp(hp: number): CoopPortalColor {
  if (hp <= 1) return 'green';
  if (hp === 2) return 'blue';
  return 'red';
}

function pickPortalHp(random: () => number): 1 | 2 | 3 {
  const roll = random();
  let acc = 0;
  for (const option of PORTAL_HP_WEIGHTS) {
    acc += option.weight;
    if (roll <= acc) return option.hp;
  }
  return 1;
}

function positionsTouch(aNow: Position, aPrev: Position, bNow: Position, bPrev: Position): boolean {
  return samePosition(aNow, bNow) || (samePosition(aNow, bPrev) && samePosition(bNow, aPrev));
}

function samePosition(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

function isWithinGrid(position: Position): boolean {
  return (
    position.row >= GRID_MIN &&
    position.row <= GRID_MAX &&
    position.col >= GRID_MIN &&
    position.col <= GRID_MAX
  );
}

function manhattan(a: Position, b: Position): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

function selectReachableTarget(
  selfPosition: Position,
  redPosition: Position,
  bluePosition: Position,
  redAlive: boolean,
  blueAlive: boolean,
  obstacles: Position[],
): Position {
  if (redAlive && !blueAlive) return redPosition;
  if (blueAlive && !redAlive) return bluePosition;

  const redDistance = manhattan(selfPosition, redPosition);
  const blueDistance = manhattan(selfPosition, bluePosition);
  const primary = redDistance <= blueDistance ? redPosition : bluePosition;
  const secondary = primary === redPosition ? bluePosition : redPosition;

  if (hasReachablePath(selfPosition, primary, obstacles)) return primary;
  if (hasReachablePath(selfPosition, secondary, obstacles)) return secondary;
  return primary;
}

function hasReachablePath(from: Position, to: Position, obstacles: Position[]): boolean {
  if (samePosition(from, to)) return true;

  const queue: Position[] = [{ ...from }];
  const visited = new Set<string>([toKey(from)]);
  const targetKey = toKey(to);

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (toKey(current) === targetKey) return true;

    for (const next of DIRECTIONS
      .map((direction) => ({
        row: current.row + direction.row,
        col: current.col + direction.col,
      }))
      .filter((next) => isWithinGrid(next) && !obstacles.some((obstacle) => samePosition(obstacle, next)))) {
      const nextKey = toKey(next);
      if (visited.has(nextKey)) continue;
      visited.add(nextKey);
      queue.push(next);
    }
  }

  return false;
}

function shuffle<T>(list: T[], random: () => number): void {
  for (let index = list.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [list[index], list[swapIndex]] = [list[swapIndex], list[index]];
  }
}

function toKey(position: Position): string {
  return `${position.row},${position.col}`;
}
