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
}): Position[] {
  const { role } = params;
  return role === 'attacker'
    ? createAttackerPath(params.selfPosition, params.opponentPosition, params.pathPoints)
    : createEscaperPath(params.selfPosition, params.opponentPosition, params.pathPoints);
}

function createAttackerPath(selfPosition: Position, targetPosition: Position, pathPoints: number): Position[] {
  const path = buildShortestPath(selfPosition, targetPosition).slice(0, pathPoints);
  if (path.length === pathPoints) return path;

  let current = path.length > 0 ? path[path.length - 1] : selfPosition;
  let previous = path.length > 1 ? path[path.length - 2] : selfPosition;

  while (path.length < pathPoints) {
    const bounceTarget = chooseBounceTarget(current, previous);
    path.push(bounceTarget);
    previous = current;
    current = bounceTarget;
  }

  return path;
}

function createEscaperPath(selfPosition: Position, threatPosition: Position, pathPoints: number): Position[] {
  const maxSpend = Math.max(1, pathPoints);
  const spend = Math.floor(Math.random() * maxSpend) + 1;
  const path: Position[] = [];

  let current = selfPosition;
  let previous: Position | null = null;

  for (let step = 0; step < spend; step++) {
    const candidates = getNeighbors(current);
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
  const repeatPenalty = previous && candidate.row === previous.row && candidate.col === previous.col ? 1.5 : 0;
  const edgePenalty = isEdge(candidate) ? 0.5 : 0;
  return distance * 10 - repeatPenalty - edgePenalty + Math.random();
}

function buildShortestPath(from: Position, to: Position): Position[] {
  const path: Position[] = [];
  let current = { ...from };

  while (current.row !== to.row) {
    current = {
      row: current.row + Math.sign(to.row - current.row),
      col: current.col,
    };
    path.push(current);
  }

  while (current.col !== to.col) {
    current = {
      row: current.row,
      col: current.col + Math.sign(to.col - current.col),
    };
    path.push(current);
  }

  return path;
}

function chooseBounceTarget(current: Position, previous: Position): Position {
  if (isValidMove(current, previous)) return previous;
  return getNeighbors(current)[0] ?? current;
}

function getNeighbors(position: Position): Position[] {
  return DIRECTIONS
    .map((direction) => ({
      row: position.row + direction.row,
      col: position.col + direction.col,
    }))
    .filter((next) => isValidMove(position, next));
}

function manhattan(a: Position, b: Position): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

function isEdge(position: Position): boolean {
  return position.row === 0 || position.row === 4 || position.col === 0 || position.col === 4;
}
