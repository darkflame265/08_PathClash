import { Position, PlayerColor, CollisionEvent, PlayerState } from '../types/game.types';

const GRID_MIN = 0;
const GRID_MAX = 4;
const MAX_OBSTACLES = 4;
const MIN_OPEN_DIRECTIONS = 2;

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

export function generateObstacles(
  matchId: string,
  turn: number,
  redPosition: Position,
  bluePosition: Position,
  obstacleCount = MAX_OBSTACLES,
): Position[] {
  const occupied = new Set([toKey(redPosition), toKey(bluePosition)]);
  const candidates: Position[] = [];

  for (let row = GRID_MIN; row <= GRID_MAX; row++) {
    for (let col = GRID_MIN; col <= GRID_MAX; col++) {
      const cell = { row, col };
      if (occupied.has(toKey(cell))) continue;
      candidates.push(cell);
    }
  }

  const random = createSeededRandom(`${matchId}:${turn}`);
  const shuffledCandidates = shuffleCandidates(candidates, random);
  const picked = pickObstacleLayout(shuffledCandidates, redPosition, bluePosition, obstacleCount);
  return picked ?? shuffledCandidates.slice(0, obstacleCount);
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

function pickObstacleLayout(
  candidates: Position[],
  redPosition: Position,
  bluePosition: Position,
  obstacleCount: number,
): Position[] | null {
  const picked: Position[] = [];
  const pickedKeys = new Set<string>();

  const search = (startIndex: number): boolean => {
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
      if (pickedKeys.has(candidateKey)) continue;

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

function positionsHaveEnoughOpenDirections(
  redPosition: Position,
  bluePosition: Position,
  obstacles: Position[]
): boolean {
  return (
    countOpenDirections(redPosition, obstacles) >= MIN_OPEN_DIRECTIONS &&
    countOpenDirections(bluePosition, obstacles) >= MIN_OPEN_DIRECTIONS
  );
}

function countOpenDirections(position: Position, obstacles: Position[]): number {
  let count = 0;
  for (const offset of DIRECTIONS) {
    const next = {
      row: position.row + offset.row,
      col: position.col + offset.col,
    };
    if (!isWithinGrid(next)) continue;
    if (isObstacle(next, obstacles)) continue;
    count += 1;
  }
  return count;
}

function isWithinGrid(position: Position): boolean {
  return (
    position.row >= GRID_MIN &&
    position.row <= GRID_MAX &&
    position.col >= GRID_MIN &&
    position.col <= GRID_MAX
  );
}

function shuffleCandidates(candidates: Position[], random: () => number): Position[] {
  const shuffled = [...candidates];
  for (let index = shuffled.length - 1; index > 0; index--) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }
  return shuffled;
}

function toKey(position: Position): string {
  return `${position.row},${position.col}`;
}

const DIRECTIONS: Position[] = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
];

function createSeededRandom(seedInput: string): () => number {
  let seed = hashString(seedInput);
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
