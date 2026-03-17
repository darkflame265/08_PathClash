import { calcPathPoints, isValidMove } from '../GameEngine';
import type { Position } from '../../types/game.types';
import type {
  TwoVsTwoPlayerHitEvent,
  TwoVsTwoSlot,
  TwoVsTwoTeam,
} from './TwoVsTwoTypes';

const GRID_MIN = 0;
const GRID_MAX = 4;
const DIRECTIONS: Position[] = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
];
const MIN_OPEN_DIRECTIONS = 2;
const MAX_OBSTACLES = 4;

export const TWO_VS_TWO_SLOTS: TwoVsTwoSlot[] = [
  'red_top',
  'red_bottom',
  'blue_top',
  'blue_bottom',
];

export function getTwoVsTwoInitialPositions(): Record<TwoVsTwoSlot, Position> {
  return {
    red_top: { row: 1, col: 0 },
    red_bottom: { row: 3, col: 0 },
    blue_top: { row: 1, col: 4 },
    blue_bottom: { row: 3, col: 4 },
  };
}

export function getSlotTeam(slot: TwoVsTwoSlot): TwoVsTwoTeam {
  return slot.startsWith('red') ? 'red' : 'blue';
}

export function calcTwoVsTwoPathPoints(turn: number): number {
  return calcPathPoints(turn);
}

export function isValidTwoVsTwoPath(
  start: Position,
  path: Position[],
  maxPoints: number,
  obstacles: Position[] = [],
): boolean {
  if (path.length > maxPoints) return false;
  let current = start;
  for (const next of path) {
    if (!isWithinGrid(next)) return false;
    if (isObstacle(next, obstacles)) return false;
    if (!isValidMove(current, next)) return false;
    current = next;
  }
  return true;
}

export function generateTwoVsTwoObstacles(
  matchId: string,
  turn: number,
  playerPositions: Record<TwoVsTwoSlot, Position>,
  obstacleCount = MAX_OBSTACLES,
): Position[] {
  const occupied = new Set(
    Object.values(playerPositions).map((position) => toKey(position)),
  );
  const candidates: Position[] = [];

  for (let row = GRID_MIN; row <= GRID_MAX; row++) {
    for (let col = GRID_MIN; col <= GRID_MAX; col++) {
      const cell = { row, col };
      if (occupied.has(toKey(cell))) continue;
      candidates.push(cell);
    }
  }

  const random = createSeededRandom(`${matchId}:${turn}:2v2`);
  const shuffled = shuffleCandidates(candidates, random);
  const picked = pickObstacleLayout(shuffled, playerPositions, obstacleCount);
  return picked ?? shuffled.slice(0, obstacleCount);
}

export function resolveTwoVsTwoMovement(params: {
  starts: Record<TwoVsTwoSlot, Position>;
  paths: Record<TwoVsTwoSlot, Position[]>;
  hps: Record<TwoVsTwoSlot, number>;
  attackerTeam: TwoVsTwoTeam;
}) {
  const sequences = Object.fromEntries(
    TWO_VS_TWO_SLOTS.map((slot) => [slot, [params.starts[slot], ...params.paths[slot]]]),
  ) as Record<TwoVsTwoSlot, Position[]>;
  const currentHp = { ...params.hps };
  const playerHits: TwoVsTwoPlayerHitEvent[] = [];
  const maxSteps = Math.max(
    1,
    ...TWO_VS_TWO_SLOTS.map((slot) => sequences[slot].length),
  );
  const attackerSlots = TWO_VS_TWO_SLOTS.filter(
    (slot) => getSlotTeam(slot) === params.attackerTeam,
  );
  const escaperSlots = TWO_VS_TWO_SLOTS.filter(
    (slot) => getSlotTeam(slot) !== params.attackerTeam,
  );

  for (let step = 0; step < maxSteps; step++) {
    const currentPositions = Object.fromEntries(
      TWO_VS_TWO_SLOTS.map((slot) => [
        slot,
        sequences[slot][Math.min(step, sequences[slot].length - 1)],
      ]),
    ) as Record<TwoVsTwoSlot, Position>;
    const previousPositions = Object.fromEntries(
      TWO_VS_TWO_SLOTS.map((slot) => [
        slot,
        sequences[slot][Math.max(0, Math.min(step - 1, sequences[slot].length - 1))],
      ]),
    ) as Record<TwoVsTwoSlot, Position>;

    for (const attackerSlot of attackerSlots) {
      for (const escaperSlot of escaperSlots) {
        if (currentHp[attackerSlot] <= 0 || currentHp[escaperSlot] <= 0) continue;
        if (
          positionsTouch(
            currentPositions[attackerSlot],
            previousPositions[attackerSlot],
            currentPositions[escaperSlot],
            previousPositions[escaperSlot],
          )
        ) {
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

  const ends = Object.fromEntries(
    TWO_VS_TWO_SLOTS.map((slot) => [slot, sequences[slot][sequences[slot].length - 1]]),
  ) as Record<TwoVsTwoSlot, Position>;

  return {
    ends,
    hps: currentHp,
    playerHits,
  };
}

function positionsHaveEnoughOpenDirections(
  playerPositions: Record<TwoVsTwoSlot, Position>,
  obstacles: Position[],
): boolean {
  return TWO_VS_TWO_SLOTS.every(
    (slot) => countOpenDirections(playerPositions[slot], obstacles) >= MIN_OPEN_DIRECTIONS,
  );
}

function pickObstacleLayout(
  candidates: Position[],
  playerPositions: Record<TwoVsTwoSlot, Position>,
  obstacleCount: number,
): Position[] | null {
  const picked: Position[] = [];
  const pickedKeys = new Set<string>();

  const search = (startIndex: number): boolean => {
    if (!positionsHaveEnoughOpenDirections(playerPositions, picked)) return false;
    if (picked.length === obstacleCount) return true;

    const remainingSlots = obstacleCount - picked.length;
    for (let index = startIndex; index <= candidates.length - remainingSlots; index++) {
      const candidate = candidates[index];
      const key = toKey(candidate);
      if (pickedKeys.has(key)) continue;
      picked.push(candidate);
      pickedKeys.add(key);
      if (search(index + 1)) return true;
      picked.pop();
      pickedKeys.delete(key);
    }
    return false;
  };

  return search(0) ? [...picked] : null;
}

function countOpenDirections(position: Position, obstacles: Position[]): number {
  let count = 0;
  for (const offset of DIRECTIONS) {
    const next = { row: position.row + offset.row, col: position.col + offset.col };
    if (!isWithinGrid(next)) continue;
    if (isObstacle(next, obstacles)) continue;
    count += 1;
  }
  return count;
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

function isObstacle(cell: Position, obstacles: Position[]): boolean {
  return obstacles.some((obstacle) => obstacle.row === cell.row && obstacle.col === cell.col);
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
