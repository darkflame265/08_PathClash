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
  const rawPath =
    role === 'attacker'
      ? createAttackerPath(
          params.selfPosition,
          params.opponentPosition,
          params.pathPoints,
          params.obstacles,
        )
      : createEscaperPath(
          params.selfPosition,
          params.opponentPosition,
          params.pathPoints,
          params.obstacles,
        );

  return collapseImmediateBacktracks(params.selfPosition, rawPath).slice(
    0,
    params.pathPoints,
  );
}

function createAttackerPath(selfPosition: Position, targetPosition: Position, pathPoints: number, obstacles: Position[]): Position[] {
  const predictedEscapePath = predictEscaperPath(
    targetPosition,
    selfPosition,
    pathPoints,
    obstacles,
  );
  const predictedTargets = buildInterceptTargets(
    targetPosition,
    predictedEscapePath,
    obstacles,
  );
  const attackTarget =
    chooseBestInterceptTarget(
      selfPosition,
      predictedTargets,
      targetPosition,
      pathPoints,
      obstacles,
    ) ?? targetPosition;

  const path = buildShortestPath(selfPosition, attackTarget, obstacles).slice(0, pathPoints);
  if (path.length === pathPoints) return path;

  let current = path.length > 0 ? path[path.length - 1] : selfPosition;
  let previous = path.length > 1 ? path[path.length - 2] : null;

  while (path.length < pathPoints) {
    const nextMove = chooseAttackerExtension(
      current,
      previous,
      attackTarget,
      obstacles,
    );
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
  const predictedThreatPath = predictAttackerPath(
    threatPosition,
    selfPosition,
    pathPoints,
    obstacles,
  );
  const path: Position[] = [];

  let current = selfPosition;
  let previous: Position | null = null;

  for (let step = 0; step < spend; step++) {
    const candidates = getNeighbors(current, obstacles).filter((candidate) => !isSamePosition(candidate, previous));
    if (candidates.length === 0) break;

    const scored = candidates
      .map((candidate) => ({
        candidate,
        score: scoreEscaperMove(
          candidate,
          threatPosition,
          previous,
          predictedThreatPath,
          obstacles,
        ),
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

function scoreEscaperMove(
  candidate: Position,
  threat: Position,
  previous: Position | null,
  predictedThreatPath: Position[],
  obstacles: Position[],
): number {
  const distance = manhattan(candidate, threat);
  const edgePenalty = isEdge(candidate) ? 0.5 : 0;
  const centerBias = isEdge(candidate) ? 0 : 0.35;
  const predictedThreatDistance = getMinDistanceToPath(candidate, predictedThreatPath);
  const mobility = countOpenNeighbors(candidate, obstacles);
  const lineTrapPenalty = predictedThreatDistance <= 1 ? 7 : 0;
  const revisitPenalty = isSamePosition(candidate, previous) ? 100 : 0;
  return (
    distance * 8 +
    predictedThreatDistance * 11 +
    mobility * 1.6 -
    edgePenalty +
    centerBias -
    lineTrapPenalty -
    revisitPenalty +
    Math.random()
  );
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

function predictEscaperPath(
  escaperPosition: Position,
  attackerPosition: Position,
  pathPoints: number,
  obstacles: Position[],
): Position[] {
  const path: Position[] = [];
  let current = escaperPosition;
  let previous: Position | null = null;

  for (let step = 0; step < pathPoints; step++) {
    const candidates = getNeighbors(current, obstacles).filter(
      (candidate) => !isSamePosition(candidate, previous),
    );
    if (candidates.length === 0) break;

    const best = candidates
      .map((candidate) => ({
        candidate,
        score:
          manhattan(candidate, attackerPosition) * 10 +
          countOpenNeighbors(candidate, obstacles) * 1.2 +
          (isEdge(candidate) ? -0.5 : 0.35),
      }))
      .sort((a, b) => b.score - a.score)[0]?.candidate;

    if (!best) break;
    path.push(best);
    previous = current;
    current = best;
  }

  return path;
}

function predictAttackerPath(
  attackerPosition: Position,
  targetPosition: Position,
  pathPoints: number,
  obstacles: Position[],
): Position[] {
  const directPath = buildShortestPath(
    attackerPosition,
    targetPosition,
    obstacles,
  ).slice(0, pathPoints);
  if (directPath.length === pathPoints) return directPath;

  const path = [...directPath];
  let current = path.length > 0 ? path[path.length - 1] : attackerPosition;
  let previous = path.length > 1 ? path[path.length - 2] : null;

  while (path.length < pathPoints) {
    const next = chooseAttackerExtension(
      current,
      previous,
      targetPosition,
      obstacles,
    );
    if (!next) break;
    path.push(next);
    previous = current;
    current = next;
  }

  return path;
}

function buildInterceptTargets(
  currentTarget: Position,
  predictedEscapePath: Position[],
  obstacles: Position[],
): Position[] {
  const ordered: Position[] = [currentTarget, ...predictedEscapePath];
  const extras = predictedEscapePath.flatMap((position) =>
    getNeighbors(position, obstacles),
  );

  const unique = new Map<string, Position>();
  for (const position of [...ordered, ...extras]) {
    unique.set(toKey(position), position);
  }
  return [...unique.values()];
}

function chooseBestInterceptTarget(
  selfPosition: Position,
  targets: Position[],
  fallbackTarget: Position,
  pathPoints: number,
  obstacles: Position[],
): Position | null {
  const scoredTargets = targets
    .map((target, index) => {
      const path = buildShortestPath(selfPosition, target, obstacles);
      if (path.length === 0 && !isSamePosition(selfPosition, target)) return null;

      const reachableNow = path.length > 0 && path.length <= pathPoints;
      const distance = path.length === 0 ? 0 : path.length;
      const futureBias = index > 0 ? 1.8 : 0;
      const fallbackDistance = manhattan(target, fallbackTarget);

      return {
        target,
        score:
          (reachableNow ? 40 : 0) +
          futureBias * 10 -
          distance * 2.2 -
          fallbackDistance * 0.9,
      };
    })
    .filter((entry): entry is { target: Position; score: number } => !!entry)
    .sort((a, b) => b.score - a.score);

  return scoredTargets[0]?.target ?? null;
}

function getMinDistanceToPath(position: Position, path: Position[]): number {
  if (path.length === 0) return 99;
  return Math.min(...path.map((step) => manhattan(position, step)));
}

function countOpenNeighbors(position: Position, obstacles: Position[]): number {
  return getNeighbors(position, obstacles).length;
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

function collapseImmediateBacktracks(
  start: Position,
  path: Position[],
): Position[] {
  const normalized: Position[] = [];

  for (const step of path) {
    const secondLast =
      normalized.length >= 2
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
