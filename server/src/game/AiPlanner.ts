import { PlayerColor, Position } from '../types/game.types';
import { isValidMove } from './GameEngine';

const DIRECTIONS: Position[] = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
];

const RANDOM_PATTERN_CHANCE = 0.5;
const ATTACK_ENEMY_PATH_DEPTH_CAP = 7;
const ATTACK_ENEMY_BEAM_WIDTH = 40;
const ATTACK_ENEMY_CANDIDATE_LIMIT = 60;
const ATTACK_AI_PATH_DEPTH_CAP = 7;
const ATTACK_AI_BEAM_WIDTH = 56;
const ATTACK_AI_CANDIDATE_LIMIT = 96;
const ATTACK_DEBUG_TOP_CANDIDATES = 5;
const AI_ATTACK_DEBUG_LOG = false;

const ATTACK_SCORE_WEIGHTS = {
  exactCollision: 240,
  crossingCollision: 210,
  adjacentPressure: 28,
  sameTileDifferentTime: 18,
  hotspotCoverage: 12,
  timedHotspotCoverage: 14,
  bottleneckCoverage: 30,
  currentEscapeLanePressure: 40,
  currentPositionPressure: 18,
  centerControl: 10,
  finalMobility: 9,
  selfTrapPenalty: 30,
  lowThreatPenalty: 120,
  distanceMissPenalty: 6,
  longDetourPenalty: 2,
} as const;

type CandidateState = {
  current: Position;
  previous: Position | null;
  path: Position[];
  visited: Set<string>;
  heuristic: number;
};

type WeightedPathCandidate = {
  path: Position[];
  heuristic: number;
  weight: number;
};

type AttackPathScore = {
  path: Position[];
  score: number;
  exactHitCandidateCount: number;
  crossingCandidateCount: number;
  hotspotCoverage: number;
  timedHotspotCoverage: number;
  bottleneckCoverage: number;
  finalMobility: number;
};

export interface AiAttackDebugData {
  enemyCandidatePathCount: number;
  aiCandidatePathCount: number;
  chosenPath: Position[];
  chosenPathScore: number;
  topCandidates: Array<{
    path: Position[];
    score: number;
    exactHitCandidateCount: number;
    crossingCandidateCount: number;
    hotspotCoverage: number;
    timedHotspotCoverage: number;
    bottleneckCoverage: number;
    finalMobility: number;
  }>;
  highPriorityCells: Array<{ key: string; count: number }>;
}

let lastAiAttackDebug: AiAttackDebugData | null = null;

export function getLastAiAttackDebug(): AiAttackDebugData | null {
  return lastAiAttackDebug;
}

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
      ? buildAttackPath(
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

function buildAttackPath(
  selfPosition: Position,
  targetPosition: Position,
  pathPoints: number,
  obstacles: Position[],
): Position[] {
  const enemyCandidates = buildEnemyEscapeCandidates(
    targetPosition,
    selfPosition,
    pathPoints,
    obstacles,
  );
  const attackCandidates = buildAttackPathCandidates(
    selfPosition,
    targetPosition,
    pathPoints,
    obstacles,
  );

  const scoredCandidates = attackCandidates
    .map((candidate) =>
      scoreAttackPathAgainstEnemyCandidates(
        selfPosition,
        targetPosition,
        candidate,
        enemyCandidates,
        obstacles,
      ),
    )
    .sort((left, right) => right.score - left.score);

  const chosen = scoredCandidates[0];
  const chosenPath = chosen
    ? extendAttackPathToFullPoints(
        selfPosition,
        chosen.path,
        targetPosition,
        pathPoints,
        obstacles,
        enemyCandidates,
      )
    : buildShortestPath(selfPosition, targetPosition, obstacles).slice(
        0,
        pathPoints,
      );

  lastAiAttackDebug = {
    enemyCandidatePathCount: enemyCandidates.candidates.length,
    aiCandidatePathCount: attackCandidates.length,
    chosenPath,
    chosenPathScore: chosen?.score ?? 0,
    topCandidates: scoredCandidates.slice(0, ATTACK_DEBUG_TOP_CANDIDATES).map((entry) => ({
      path: entry.path,
      score: entry.score,
      exactHitCandidateCount: entry.exactHitCandidateCount,
      crossingCandidateCount: entry.crossingCandidateCount,
      hotspotCoverage: entry.hotspotCoverage,
      timedHotspotCoverage: entry.timedHotspotCoverage,
      bottleneckCoverage: entry.bottleneckCoverage,
      finalMobility: entry.finalMobility,
    })),
    highPriorityCells: enemyCandidates.highPriorityCells,
  };

  if (AI_ATTACK_DEBUG_LOG) {
    console.debug('[ai-attack-debug]', lastAiAttackDebug);
  }

  return chosenPath;
}

function buildEnemyEscapeCandidates(
  escaperPosition: Position,
  attackerPosition: Position,
  pathPoints: number,
  obstacles: Position[],
): {
  candidates: WeightedPathCandidate[];
  heatmap: Map<string, number>;
  timeHeatmap: Map<string, number>;
  bottleneckHeatmap: Map<string, number>;
  currentEscapeNeighbors: Position[];
  highPriorityCells: Array<{ key: string; count: number }>;
} {
  const maxDepth = Math.min(pathPoints, ATTACK_ENEMY_PATH_DEPTH_CAP);
  const seed: CandidateState = {
    current: escaperPosition,
    previous: null,
    path: [],
    visited: new Set<string>([toKey(escaperPosition)]),
    heuristic: scoreEnemyEscapeState(escaperPosition, attackerPosition, 0, obstacles),
  };

  let frontier: CandidateState[] = [seed];
  const rawCandidates: WeightedPathCandidate[] = [
    {
      path: [],
      heuristic: seed.heuristic,
      weight: 1,
    },
  ];

  for (let depth = 1; depth <= maxDepth; depth++) {
    const nextStates: CandidateState[] = [];

    for (const state of frontier) {
      const neighbors = getNeighbors(state.current, obstacles)
        .filter((candidate) => !isSamePosition(candidate, state.previous))
        .filter((candidate) => !state.visited.has(toKey(candidate)));

      for (const neighbor of neighbors) {
        const path = [...state.path, neighbor];
        const visited = new Set(state.visited);
        visited.add(toKey(neighbor));
        const heuristic =
          scoreEnemyEscapeState(neighbor, attackerPosition, depth, obstacles) +
          path.length * 1.6;
        const nextState: CandidateState = {
          current: neighbor,
          previous: state.current,
          path,
          visited,
          heuristic,
        };
        nextStates.push(nextState);
        rawCandidates.push({
          path,
          heuristic,
          weight: 1,
        });
      }
    }

    frontier = nextStates
      .sort((left, right) => right.heuristic - left.heuristic)
      .slice(0, ATTACK_ENEMY_BEAM_WIDTH);

    if (frontier.length === 0) break;
  }

  const deduped = dedupeWeightedCandidates(rawCandidates).sort(
    (left, right) => right.heuristic - left.heuristic,
  );
  const candidates = deduped.slice(0, ATTACK_ENEMY_CANDIDATE_LIMIT).map((candidate, index) => ({
    ...candidate,
    weight: 1 + Math.max(0, ATTACK_ENEMY_CANDIDATE_LIMIT - index) * 0.04,
  }));

  const heatmap = new Map<string, number>();
  const timeHeatmap = new Map<string, number>();
  const bottleneckHeatmap = new Map<string, number>();

  for (const candidate of candidates) {
    const sequence = [escaperPosition, ...candidate.path];
    for (let step = 0; step < sequence.length; step++) {
      const key = toKey(sequence[step]);
      heatmap.set(key, (heatmap.get(key) ?? 0) + candidate.weight);
      timeHeatmap.set(
        `${step}:${key}`,
        (timeHeatmap.get(`${step}:${key}`) ?? 0) + candidate.weight,
      );
      if (countOpenNeighbors(sequence[step], obstacles) <= 2) {
        bottleneckHeatmap.set(
          key,
          (bottleneckHeatmap.get(key) ?? 0) + candidate.weight,
        );
      }
    }
  }

  const currentEscapeNeighbors = getOpenNeighbors(escaperPosition, obstacles);
  const highPriorityCells = [...heatmap.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([key, count]) => ({ key, count: Number(count.toFixed(2)) }));

  return {
    candidates,
    heatmap,
    timeHeatmap,
    bottleneckHeatmap,
    currentEscapeNeighbors,
    highPriorityCells,
  };
}

function buildAttackPathCandidates(
  start: Position,
  target: Position,
  pathPoints: number,
  obstacles: Position[],
): Position[][] {
  const maxDepth = Math.min(pathPoints, ATTACK_AI_PATH_DEPTH_CAP);
  const directPath = buildShortestPath(start, target, obstacles).slice(0, maxDepth);
  const rawCandidates: Position[][] = [directPath];

  let frontier: CandidateState[] = [
    {
      current: start,
      previous: null,
      path: [],
      visited: new Set<string>([toKey(start)]),
      heuristic: 0,
    },
  ];

  for (let depth = 1; depth <= maxDepth; depth++) {
    const nextStates: CandidateState[] = [];

    for (const state of frontier) {
      const neighbors = getNeighbors(state.current, obstacles)
        .filter((candidate) => !isSamePosition(candidate, state.previous))
        .filter((candidate) => !state.visited.has(toKey(candidate)));

      for (const neighbor of neighbors) {
        const path = [...state.path, neighbor];
        const visited = new Set(state.visited);
        visited.add(toKey(neighbor));
        const heuristic =
          state.heuristic +
          scoreAttackExpansionHeuristic(neighbor, target, depth, obstacles);
        const nextState: CandidateState = {
          current: neighbor,
          previous: state.current,
          path,
          visited,
          heuristic,
        };
        nextStates.push(nextState);
        rawCandidates.push(path);
      }
    }

    frontier = nextStates
      .sort((left, right) => right.heuristic - left.heuristic)
      .slice(0, ATTACK_AI_BEAM_WIDTH);

    if (frontier.length === 0) break;
  }

  const deduped = new Map<string, Position[]>();
  for (const candidate of rawCandidates) {
    const normalized = collapseImmediateBacktracks(start, candidate);
    if (normalized.length === 0) continue;
    const key = pathToKey(normalized);
    if (!deduped.has(key)) {
      deduped.set(key, normalized);
    }
  }

  return [...deduped.values()].slice(0, ATTACK_AI_CANDIDATE_LIMIT);
}

function scoreAttackPathAgainstEnemyCandidates(
  start: Position,
  targetPosition: Position,
  candidatePath: Position[],
  enemyCandidates: {
    candidates: WeightedPathCandidate[];
    heatmap: Map<string, number>;
    timeHeatmap: Map<string, number>;
    bottleneckHeatmap: Map<string, number>;
    currentEscapeNeighbors: Position[];
  },
  obstacles: Position[],
): AttackPathScore {
  const aiSequence = [start, ...candidatePath];
  const uniqueAiKeys = new Set(aiSequence.map((step) => toKey(step)));
  let score = 0;
  let exactHitCandidateCount = 0;
  let crossingCandidateCount = 0;

  for (const enemyCandidate of enemyCandidates.candidates) {
    const enemySequence = [targetPosition, ...enemyCandidate.path];
    let candidateThreatScore = 0;
    let exactHit = false;
    let crossingHit = false;

    const maxSteps = Math.max(aiSequence.length, enemySequence.length);
    for (let step = 0; step < maxSteps; step++) {
      const aiCurrent = aiSequence[Math.min(step, aiSequence.length - 1)];
      const aiPrev = step > 0 ? aiSequence[Math.min(step - 1, aiSequence.length - 1)] : aiSequence[0];
      const enemyCurrent = enemySequence[Math.min(step, enemySequence.length - 1)];
      const enemyPrev = step > 0
        ? enemySequence[Math.min(step - 1, enemySequence.length - 1)]
        : enemySequence[0];

      if (sameCell(aiCurrent, enemyCurrent)) {
        candidateThreatScore += ATTACK_SCORE_WEIGHTS.exactCollision;
        exactHit = true;
      } else if (sameCell(aiPrev, enemyCurrent) && sameCell(aiCurrent, enemyPrev)) {
        candidateThreatScore += ATTACK_SCORE_WEIGHTS.crossingCollision;
        crossingHit = true;
      } else {
        const distance = manhattan(aiCurrent, enemyCurrent);
        if (distance === 1) {
          candidateThreatScore += ATTACK_SCORE_WEIGHTS.adjacentPressure;
        } else if (sameCell(aiCurrent, enemyPrev) || sameCell(aiPrev, enemyCurrent)) {
          candidateThreatScore += ATTACK_SCORE_WEIGHTS.sameTileDifferentTime;
        }
      }

      const currentKey = toKey(aiCurrent);
      candidateThreatScore +=
        (enemyCandidates.timeHeatmap.get(`${step}:${currentKey}`) ?? 0) *
        ATTACK_SCORE_WEIGHTS.timedHotspotCoverage;
    }

    if (exactHit) exactHitCandidateCount += 1;
    if (crossingHit) crossingCandidateCount += 1;
    score += candidateThreatScore * enemyCandidate.weight;
  }

  const hotspotCoverage = sumHeat(uniqueAiKeys, enemyCandidates.heatmap);
  const timedHotspotCoverage = aiSequence.reduce((sum, position, step) => {
    return sum + (enemyCandidates.timeHeatmap.get(`${step}:${toKey(position)}`) ?? 0);
  }, 0);
  const bottleneckCoverage = sumHeat(uniqueAiKeys, enemyCandidates.bottleneckHeatmap);
  const currentEscapeLanePressure = enemyCandidates.currentEscapeNeighbors.reduce(
    (sum, neighbor) => sum + (uniqueAiKeys.has(toKey(neighbor)) ? 1 : 0),
    0,
  );
  const currentPositionPressure = candidatePath.some((step) => manhattan(step, targetPosition) <= 1)
    ? 1
    : 0;
  const finalPosition = candidatePath[candidatePath.length - 1] ?? start;
  const finalMobility = countOpenNeighbors(finalPosition, obstacles);
  const selfTrapPenalty = finalMobility <= 1 ? 1 : 0;
  const centerControl = isEdge(finalPosition) ? 0 : 1;
  const noThreatPenalty =
    exactHitCandidateCount === 0 &&
    crossingCandidateCount === 0 &&
    hotspotCoverage < 2
      ? 1
      : 0;
  const distanceMissPenalty = Math.max(
    0,
    getMinDistanceToPath(finalPosition, enemyCandidates.candidates.flatMap((candidate) => candidate.path)) - 1,
  );

  score += hotspotCoverage * ATTACK_SCORE_WEIGHTS.hotspotCoverage;
  score += timedHotspotCoverage * ATTACK_SCORE_WEIGHTS.timedHotspotCoverage;
  score += bottleneckCoverage * ATTACK_SCORE_WEIGHTS.bottleneckCoverage;
  score += currentEscapeLanePressure * ATTACK_SCORE_WEIGHTS.currentEscapeLanePressure;
  score += currentPositionPressure * ATTACK_SCORE_WEIGHTS.currentPositionPressure;
  score += centerControl * ATTACK_SCORE_WEIGHTS.centerControl;
  score += finalMobility * ATTACK_SCORE_WEIGHTS.finalMobility;
  score -= selfTrapPenalty * ATTACK_SCORE_WEIGHTS.selfTrapPenalty;
  score -= noThreatPenalty * ATTACK_SCORE_WEIGHTS.lowThreatPenalty;
  score -= distanceMissPenalty * ATTACK_SCORE_WEIGHTS.distanceMissPenalty;
  score -= Math.max(0, candidatePath.length - 5) * ATTACK_SCORE_WEIGHTS.longDetourPenalty;

  return {
    path: candidatePath,
    score,
    exactHitCandidateCount,
    crossingCandidateCount,
    hotspotCoverage,
    timedHotspotCoverage,
    bottleneckCoverage,
    finalMobility,
  };
}

function extendAttackPathToFullPoints(
  start: Position,
  basePath: Position[],
  target: Position,
  pathPoints: number,
  obstacles: Position[],
  enemyCandidates: {
    heatmap: Map<string, number>;
    bottleneckHeatmap: Map<string, number>;
  },
): Position[] {
  const path = [...basePath].slice(0, pathPoints);
  if (path.length >= pathPoints) return path;

  let current = path[path.length - 1] ?? start;
  let previous = path.length > 1 ? path[path.length - 2] : null;

  while (path.length < pathPoints) {
    const candidates = getNeighbors(current, obstacles)
      .filter((candidate) => !isSamePosition(candidate, previous))
      .filter((candidate) => !path.some((step) => sameCell(step, candidate)));
    if (candidates.length === 0) break;

    const nextMove = candidates
      .map((candidate) => ({
        candidate,
        score:
          (enemyCandidates.heatmap.get(toKey(candidate)) ?? 0) * 5 +
          (enemyCandidates.bottleneckHeatmap.get(toKey(candidate)) ?? 0) * 8 -
          manhattan(candidate, target) * 0.8 +
          countOpenNeighbors(candidate, obstacles) * 1.4,
      }))
      .sort((left, right) => right.score - left.score)[0]?.candidate;

    if (!nextMove) break;
    path.push(nextMove);
    previous = current;
    current = nextMove;
  }

  return path;
}

function createEscaperPath(selfPosition: Position, threatPosition: Position, pathPoints: number, obstacles: Position[]): Position[] {
  if (Math.random() < RANDOM_PATTERN_CHANCE) {
    return createRandomRoamPath(selfPosition, threatPosition, pathPoints, obstacles);
  }

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

function getNeighbors(position: Position, obstacles: Position[]): Position[] {
  return DIRECTIONS
    .map((direction) => ({
      row: position.row + direction.row,
      col: position.col + direction.col,
    }))
    .filter((next) => isValidMove(position, next) && !isBlocked(next, obstacles));
}

function createRandomRoamPath(
  selfPosition: Position,
  referencePosition: Position,
  pathPoints: number,
  obstacles: Position[],
): Position[] {
  const randomTarget = chooseRandomReachableTarget(
    selfPosition,
    referencePosition,
    obstacles,
  );
  if (!randomTarget) return [];

  const directPath = buildShortestPath(selfPosition, randomTarget, obstacles).slice(
    0,
    pathPoints,
  );
  if (directPath.length === pathPoints) return directPath;

  const path = [...directPath];
  let current = path.length > 0 ? path[path.length - 1] : selfPosition;
  let previous = path.length > 1 ? path[path.length - 2] : null;

  while (path.length < pathPoints) {
    const candidates = getNeighbors(current, obstacles).filter(
      (candidate) => !isSamePosition(candidate, previous),
    );
    if (candidates.length === 0) break;

    const shuffled = [...candidates].sort(() => Math.random() - 0.5);
    const nextMove =
      shuffled.find((candidate) => !path.some((step) => isSamePosition(step, candidate))) ??
      shuffled[0];

    if (!nextMove) break;
    path.push(nextMove);
    previous = current;
    current = nextMove;
  }

  return path;
}

function chooseRandomReachableTarget(
  selfPosition: Position,
  referencePosition: Position,
  obstacles: Position[],
): Position | null {
  const candidates: Position[] = [];
  for (let row = 0; row <= 4; row++) {
    for (let col = 0; col <= 4; col++) {
      const candidate = { row, col };
      if (isSamePosition(candidate, selfPosition)) continue;
      if (isBlocked(candidate, obstacles)) continue;
      const path = buildShortestPath(selfPosition, candidate, obstacles);
      if (path.length === 0) continue;
      candidates.push(candidate);
    }
  }

  if (candidates.length === 0) return null;

  const shuffled = [...candidates].sort(() => Math.random() - 0.5);
  const weighted = shuffled.sort(
    (a, b) =>
      manhattan(b, referencePosition) -
      manhattan(a, referencePosition) +
      (Math.random() - 0.5),
  );

  return weighted[0] ?? shuffled[0] ?? null;
}

function predictAttackerPath(
  attackerPosition: Position,
  targetPosition: Position,
  pathPoints: number,
  obstacles: Position[],
): Position[] {
  return buildAttackPath(
    attackerPosition,
    targetPosition,
    pathPoints,
    obstacles,
  ).slice(0, pathPoints);
}

function scoreEnemyEscapeState(
  candidate: Position,
  attackerPosition: Position,
  depth: number,
  obstacles: Position[],
): number {
  return (
    manhattan(candidate, attackerPosition) * 10 +
    countOpenNeighbors(candidate, obstacles) * 4.5 +
    (isEdge(candidate) ? -1.2 : 1.8) -
    depth * 0.35 +
    Math.random() * 0.25
  );
}

function scoreAttackExpansionHeuristic(
  candidate: Position,
  targetPosition: Position,
  depth: number,
  obstacles: Position[],
): number {
  return (
    countOpenNeighbors(candidate, obstacles) * 2.4 +
    (isEdge(candidate) ? -0.4 : 0.9) -
    manhattan(candidate, targetPosition) * 1.2 -
    depth * 0.15
  );
}

function dedupeWeightedCandidates(
  candidates: WeightedPathCandidate[],
): WeightedPathCandidate[] {
  const byKey = new Map<string, WeightedPathCandidate>();
  for (const candidate of candidates) {
    const key = pathToKey(candidate.path);
    const existing = byKey.get(key);
    if (!existing || candidate.heuristic > existing.heuristic) {
      byKey.set(key, candidate);
    }
  }
  return [...byKey.values()];
}

function sumHeat(keys: Set<string>, heatmap: Map<string, number>): number {
  let total = 0;
  for (const key of keys) {
    total += heatmap.get(key) ?? 0;
  }
  return total;
}

function getMinDistanceToPath(position: Position, path: Position[]): number {
  if (path.length === 0) return 99;
  return Math.min(...path.map((step) => manhattan(position, step)));
}

function countOpenNeighbors(position: Position, obstacles: Position[]): number {
  return getNeighbors(position, obstacles).length;
}

function getOpenNeighbors(position: Position, obstacles: Position[]): Position[] {
  return getNeighbors(position, obstacles);
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

function sameCell(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

function isBlocked(position: Position, obstacles: Position[]): boolean {
  return obstacles.some((obstacle) => isSamePosition(position, obstacle));
}

function toKey(position: Position): string {
  return `${position.row},${position.col}`;
}

function pathToKey(path: Position[]): string {
  return path.map((position) => toKey(position)).join('>');
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
