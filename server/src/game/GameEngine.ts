import { Position, PlayerColor, CollisionEvent, PlayerState } from '../types/game.types';

const GRID_MIN = 0;
const GRID_MAX = 4;
const MAX_OBSTACLES = 3;

export function calcPathPoints(turn: number): number {
  return Math.min(4 + turn, 10);
}

export function isValidMove(from: Position, to: Position): boolean {
  const dr = Math.abs(to.row - from.row);
  const dc = Math.abs(to.col - from.col);
  return (
    dr + dc === 1 &&
    to.row >= GRID_MIN && to.row <= GRID_MAX &&
    to.col >= GRID_MIN && to.col <= GRID_MAX
  );
}

export function isValidPath(start: Position, path: Position[], maxPoints: number, obstacles: Position[] = []): boolean {
  if (path.length > maxPoints) return false;
  let cur = start;
  for (const next of path) {
    if (isObstacle(next, obstacles)) return false;
    if (!isValidMove(cur, next)) return false;
    cur = next;
  }
  return true;
}

export function generateObstacles(redPosition: Position, bluePosition: Position): Position[] {
  const occupied = new Set([toKey(redPosition), toKey(bluePosition)]);
  const candidates: Position[] = [];

  const rowMin = Math.min(redPosition.row, bluePosition.row);
  const rowMax = Math.max(redPosition.row, bluePosition.row);
  const colMin = Math.min(redPosition.col, bluePosition.col);
  const colMax = Math.max(redPosition.col, bluePosition.col);

  for (let row = GRID_MIN; row <= GRID_MAX; row++) {
    for (let col = GRID_MIN; col <= GRID_MAX; col++) {
      const cell = { row, col };
      const key = toKey(cell);
      if (occupied.has(key)) continue;
      if (!isBetweenPlayers(cell, redPosition, bluePosition, rowMin, rowMax, colMin, colMax)) continue;
      candidates.push(cell);
    }
  }

  shuffle(candidates);
  return candidates.slice(0, Math.min(MAX_OBSTACLES, candidates.length));
}

export function detectCollisions(
  redPath: Position[],
  bluePath: Position[],
  redStart: Position,
  blueStart: Position,
  attackerColor: PlayerColor,
  escaperHp: number
): CollisionEvent[] {
  const events: CollisionEvent[] = [];
  const escapeeColor: PlayerColor = attackerColor === 'red' ? 'blue' : 'red';

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
      if (
        r.row === bPrev.row && r.col === bPrev.col &&
        b.row === rPrev.row && b.col === rPrev.col
      ) {
        currentHp = Math.max(0, currentHp - 1);
        events.push({ step: i, position: r, escapeeColor, newHp: currentHp });
      }
    }
  }

  return events;
}

export function getInitialPositions(): { red: Position; blue: Position } {
  return {
    red: { row: 2, col: 0 },
    blue: { row: 2, col: 4 },
  };
}

export function calcAnimationDuration(pathLength: number): number {
  // 200ms per step + 300ms buffer
  return pathLength * 200 + 300;
}

export function toClientPlayer(p: PlayerState) {
  const { socketId: _s, ...rest } = p;
  return rest;
}

export function isObstacle(cell: Position, obstacles: Position[]): boolean {
  return obstacles.some((obstacle) => obstacle.row === cell.row && obstacle.col === cell.col);
}

function isBetweenPlayers(
  cell: Position,
  redPosition: Position,
  bluePosition: Position,
  rowMin: number,
  rowMax: number,
  colMin: number,
  colMax: number
): boolean {
  const withinBox = cell.row >= rowMin && cell.row <= rowMax && cell.col >= colMin && cell.col <= colMax;
  const betweenDistance =
    manhattan(redPosition, cell) + manhattan(cell, bluePosition) === manhattan(redPosition, bluePosition);
  return withinBox || betweenDistance;
}

function manhattan(a: Position, b: Position): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

function toKey(position: Position): string {
  return `${position.row},${position.col}`;
}

function shuffle<T>(items: T[]): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}
