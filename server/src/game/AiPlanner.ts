import { PlayerColor, Position } from '../types/game.types';
import { isValidMove } from './GameEngine';

const DIRECTIONS: Position[] = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
];

export function createAiPath(params: {
  color: PlayerColor;
  role: 'attacker' | 'escaper';
  selfPosition: Position;
  opponentPosition: Position;
  pathPoints: number;
  obstacles: Position[];
}): Position[] {
  const { role } = params;
  return role === 'attacker'
    ? createAttackerPath(params.selfPosition, params.opponentPosition, params.pathPoints, params.obstacles)
    : createEscaperPath(params.selfPosition, params.opponentPosition, params.pathPoints, params.obstacles);
}

function createAttackerPath(selfPosition: Position, targetPosition: Position, pathPoints: number, obstacles: Position[]): Position[] {
  const path = buildShortestPath(selfPosition, targetPosition, obstacles).slice(0, pathPoints);
  if (path.length === pathPoints) return path;

  let current = path.length > 0 ? path[path.length - 1] : selfPosition;
  let previous = path.length > 1 ? path[path.length - 2] : null;

  while (path.length < pathPoints) {
    const nextMove = chooseAttackerExtension(current, previous, targetPosition, obstacles);
    if (!nextMove) break;

    path.push(nextMove);
    previous = current;
    current = nextMove;
  }

  return path;
}

function createEscaperPath(selfPosition: Position, threatPosition: Position, pathPoints: number, obstacles: Position[]): Position[] {
  const maxSpend = Math.max(1, pathPoints);
  const spend = Math.floor(Math.random() * maxSpend) + 1;
  const path: Position[] = [];

  let current = selfPosition;
  let previous: Position | null = null;

  for (let step = 0; step < spend; step++) {
    const candidates = getNeighbors(current, obstacles).filter((candidate) => !isSamePosition(candidate, previous));
    if (candidates.length === 0) break;

    const scored = candidates
      .map((candidate) => ({
        candidate,
        score: scoreEscaperMove(candidate, threatPosition, previous),
      }))
      .sort((a, b) => b.score - a.score);

    const topScore = scored[0]?.score ?? 0;
    const topMoves = scored.filter((item) => item.score >= topScore - 1.5);
    const choice = topMoves[Math.floor(Math.random() * topMoves.length)]?.candidate;
    if (!choice) break;

    path.push(choice);
    previous = current;
    current = choice;
  }

  return path;
}

function scoreEscaperMove(candidate: Position, threat: Position, previous: Position | null): number {
  const distance = manhattan(candidate, threat);
  const edgePenalty = isEdge(candidate) ? 0.5 : 0;
  const centerBias = isEdge(candidate) ? 0 : 0.35;
  return distance * 10 - edgePenalty + centerBias + Math.random();
}

function buildShortestPath(from: Position, to: Position, obstacles: Position[]): Position[] {
  const startKey = toKey(from);
  const targetKey = toKey(to);
  const queue: Position[] = [{ ...from }];
  const visited = new Set<string>([startKey]);
  const previous = new Map<string, string>();
  const positionMap = new Map<string, Position>([[startKey, { ...from }]]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentKey = toKey(current);
    if (currentKey === targetKey) break;

    for (const next of getNeighbors(current, obstacles)) {
      const nextKey = toKey(next);
      if (visited.has(nextKey)) continue;
      visited.add(nextKey);
      previous.set(nextKey, currentKey);
      positionMap.set(nextKey, next);
      queue.push(next);
    }
  }

  if (!visited.has(targetKey)) return [];

  const reversedPath: Position[] = [];
  let cursor = targetKey;
  while (cursor !== startKey) {
    const pos = positionMap.get(cursor);
    if (!pos) break;
    reversedPath.push(pos);
    cursor = previous.get(cursor)!;
  }

  return reversedPath.reverse();
}

function chooseAttackerExtension(current: Position, previous: Position | null, target: Position, obstacles: Position[]): Position | null {
  const candidates = getNeighbors(current, obstacles).filter((candidate) => !isSamePosition(candidate, previous));
  if (candidates.length === 0) return null;

  candidates.sort((a, b) => manhattan(a, target) - manhattan(b, target));
  const bestDistance = manhattan(candidates[0], target);
  const bestMoves = candidates.filter((candidate) => manhattan(candidate, target) === bestDistance);
  return bestMoves[Math.floor(Math.random() * bestMoves.length)] ?? null;
}

function getNeighbors(position: Position, obstacles: Position[]): Position[] {
  return DIRECTIONS
    .map((direction) => ({
      row: position.row + direction.row,
      col: position.col + direction.col,
    }))
    .filter((next) => isValidMove(position, next) && !isBlocked(next, obstacles));
}

function manhattan(a: Position, b: Position): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

function isEdge(position: Position): boolean {
  return position.row === 0 || position.row === 4 || position.col === 0 || position.col === 4;
}

function isSamePosition(a: Position, b: Position | null): boolean {
  return !!b && a.row === b.row && a.col === b.col;
}

function isBlocked(position: Position, obstacles: Position[]): boolean {
  return obstacles.some((obstacle) => isSamePosition(position, obstacle));
}

function toKey(position: Position): string {
  return `${position.row},${position.col}`;
}
