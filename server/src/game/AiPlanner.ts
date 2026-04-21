import { PlayerColor, Position } from '../types/game.types';
import { isValidMove } from './GameEngine';

const DIRECTIONS: Position[] = [
  { row: -1, col: 0 },
  { row: 1, col: 0 },
  { row: 0, col: -1 },
  { row: 0, col: 1 },
];

const ATTACK_ENEMY_PATH_DEPTH_CAP = 7;
const ATTACK_ENEMY_BEAM_WIDTH = 40;
const ATTACK_ENEMY_CANDIDATE_LIMIT = 60;
const ATTACK_AI_PATH_DEPTH_CAP = 7;
const ATTACK_AI_BEAM_WIDTH = 56;
const ATTACK_AI_CANDIDATE_LIMIT = 96;
const ATTACK_DEBUG_TOP_CANDIDATES = 5;
const ESCAPE_PATH_DEPTH_CAP = 7;
const ESCAPE_BEAM_WIDTH = 56;
const ESCAPE_CANDIDATE_LIMIT = 96;
const ESCAPE_DEBUG_TOP_CANDIDATES = 5;
const AI_ATTACK_DEBUG_LOG = false;
const AI_ESCAPE_DEBUG_LOG = false;

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

const ESCAPE_SCORE_WEIGHTS = {
  exactCollisionDanger: 260,
  crossingCollisionDanger: 230,
  adjacentDanger: 32,
  sameTileDifferentTimeDanger: 22,
  dangerHeat: 11,
  timedDangerHeat: 15,
  bottleneckDanger: 24,
  threatLaneDanger: 36,
  finalMobility: 16,
  futureMobility: 9,
  distanceFromThreat: 8,
  centerFlexibility: 10,
  cornerTrapPenalty: 26,
  edgeTrapPenalty: 9,
  bottleneckTrapPenalty: 22,
  lowMobilityPenalty: 26,
  directLinePenalty: 8,
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

type EscapePathScore = {
  path: Position[];
  score: number;
  exactDangerCount: number;
  crossingDangerCount: number;
  dangerExposure: number;
  timedDangerExposure: number;
  finalMobility: number;
  futureMobility: number;
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

export interface AiEscapeDebugData {
  escapeCandidatePathCount: number;
  enemyAttackCandidateCount: number;
  chosenPath: Position[];
  chosenPathScore: number;
  topCandidates: Array<{
    path: Position[];
    score: number;
    exactDangerCount: number;
    crossingDangerCount: number;
    dangerExposure: number;
    timedDangerExposure: number;
    finalMobility: number;
    futureMobility: number;
  }>;
  highDangerCells: Array<{ key: string; count: number }>;
}

let lastAiAttackDebug: AiAttackDebugData | null = null;
let lastAiEscapeDebug: AiEscapeDebugData | null = null;

export function getLastAiAttackDebug(): AiAttackDebugData | null {
  return lastAiAttackDebug;
}

export function getLastAiEscapeDebug(): AiEscapeDebugData | null {
  return lastAiEscapeDebug;
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

  const chosen = pickWeightedTopThree(scoredCandidates);
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
  const threatCandidates = buildThreatAttackCandidates(
    threatPosition,
    selfPosition,
    pathPoints,
    obstacles,
  );
  const escapeCandidates = buildEscapePathCandidates(
    selfPosition,
    threatPosition,
    pathPoints,
    obstacles,
  );
  const futureThreatCache = new Map<string, ReturnType<typeof buildThreatAttackCandidates>>();

  const scoredCandidates = escapeCandidates
    .map((candidate) =>
      scoreEscapePathAgainstEnemyAttackCandidates(
        selfPosition,
        threatPosition,
        candidate,
        threatCandidates,
        obstacles,
        pathPoints,
        futureThreatCache,
      ),
    )
    .sort((left, right) => right.score - left.score);

  // 50% 확률로 "등잔 밑" 패턴: 상대방 쪽으로 첫 이동하는 예측 불가 경로 선택
  // 방향별로 그룹핑 후 방향 자체를 50/50으로 선택해 편향 방지
  let chosen: EscapePathScore | null | undefined;
  if (Math.random() < 0.5) {
    const boldCandidates = scoredCandidates.filter((candidate) => {
      if (candidate.path.length === 0) return false;
      const firstStep = candidate.path[0];
      return manhattan(firstStep, threatPosition) < manhattan(selfPosition, threatPosition);
    });
    if (boldCandidates.length > 0) {
      const byDirection = new Map<string, EscapePathScore[]>();
      for (const candidate of boldCandidates) {
        const dirKey = toKey(candidate.path[0]);
        if (!byDirection.has(dirKey)) byDirection.set(dirKey, []);
        byDirection.get(dirKey)!.push(candidate);
      }
      const groups = [...byDirection.values()];
      const pickedGroup = groups[Math.floor(Math.random() * groups.length)];
      chosen = pickedGroup[0];
    } else {
      chosen = pickWeightedTopThree(scoredCandidates);
    }
  } else {
    chosen = pickWeightedTopThree(scoredCandidates);
  }
  const chosenPath = chosen?.path ?? [];

  lastAiEscapeDebug = {
    escapeCandidatePathCount: escapeCandidates.length,
    enemyAttackCandidateCount: threatCandidates.candidates.length,
    chosenPath,
    chosenPathScore: chosen?.score ?? 0,
    topCandidates: scoredCandidates.slice(0, ESCAPE_DEBUG_TOP_CANDIDATES).map((entry) => ({
      path: entry.path,
      score: entry.score,
      exactDangerCount: entry.exactDangerCount,
      crossingDangerCount: entry.crossingDangerCount,
      dangerExposure: entry.dangerExposure,
      timedDangerExposure: entry.timedDangerExposure,
      finalMobility: entry.finalMobility,
      futureMobility: entry.futureMobility,
    })),
    highDangerCells: threatCandidates.highDangerCells,
  };

  if (AI_ESCAPE_DEBUG_LOG) {
    console.debug('[ai-escape-debug]', lastAiEscapeDebug);
  }

  return chosenPath;
}

function buildThreatAttackCandidates(
  attackerPosition: Position,
  targetPosition: Position,
  pathPoints: number,
  obstacles: Position[],
): {
  candidates: WeightedPathCandidate[];
  heatmap: Map<string, number>;
  timeHeatmap: Map<string, number>;
  bottleneckHeatmap: Map<string, number>;
  highDangerCells: Array<{ key: string; count: number }>;
} {
  const attackTargets = buildThreatAttackTargets(
    attackerPosition,
    targetPosition,
    obstacles,
  );
  const weightedCandidates: WeightedPathCandidate[] = [];

  for (const anchor of attackTargets) {
    const attackCandidates = buildAttackPathCandidates(
      attackerPosition,
      anchor.target,
      pathPoints,
      obstacles,
    );

    for (const path of attackCandidates) {
      const sequence = [attackerPosition, ...path];
      const finalPosition = sequence[sequence.length - 1] ?? attackerPosition;
      const minDistanceToTarget = Math.min(
        ...sequence.map((step) => manhattan(step, targetPosition)),
      );
      const minDistanceToAnchor = Math.min(
        ...sequence.map((step) => manhattan(step, anchor.target)),
      );
      const finalDistance = manhattan(finalPosition, targetPosition);
      const pressure =
        Math.max(0, 5 - minDistanceToTarget) * 2.8 +
        Math.max(0, 5 - minDistanceToAnchor) * 1.9 +
        Math.max(0, 5 - finalDistance) * 1.7 +
        countOpenNeighbors(finalPosition, obstacles) * 0.45 +
        anchor.priority;

      weightedCandidates.push({
        path,
        heuristic: pressure,
        weight: 1 + pressure,
      });
    }
  }

  const candidates = dedupeWeightedCandidates(weightedCandidates)
    .sort((left, right) => right.heuristic - left.heuristic)
    .slice(0, ATTACK_AI_CANDIDATE_LIMIT);

  const heatmap = new Map<string, number>();
  const timeHeatmap = new Map<string, number>();
  const bottleneckHeatmap = new Map<string, number>();

  for (const candidate of candidates) {
    const sequence = [attackerPosition, ...candidate.path];
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

  const highDangerCells = [...heatmap.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([key, count]) => ({ key, count: Number(count.toFixed(2)) }));

  return {
    candidates,
    heatmap,
    timeHeatmap,
    bottleneckHeatmap,
    highDangerCells,
  };
}

function buildEscapePathCandidates(
  start: Position,
  threat: Position,
  pathPoints: number,
  obstacles: Position[],
): Position[][] {
  const maxDepth = Math.min(pathPoints, ESCAPE_PATH_DEPTH_CAP);
  const rawCandidates: Position[][] = [[]];
  let frontier: CandidateState[] = [
    {
      current: start,
      previous: null,
      path: [],
      visited: new Set<string>([toKey(start)]),
      heuristic: scoreEscapeExpansionHeuristic(start, threat, 0, obstacles),
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
          scoreEscapeExpansionHeuristic(neighbor, threat, depth, obstacles);
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
      .slice(0, ESCAPE_BEAM_WIDTH);

    if (frontier.length === 0) break;
  }

  for (const boardTarget of listBoardPositions().filter(
    (candidate) =>
      !isBlocked(candidate, obstacles) && !sameCell(candidate, start),
  )) {
    const shortestPath = buildShortestPath(start, boardTarget, obstacles).slice(
      0,
      maxDepth,
    );
    if (shortestPath.length > 0) {
      rawCandidates.push(shortestPath);
    }
  }

  const deduped = new Map<string, Position[]>();
  for (const candidate of rawCandidates) {
    const normalized = collapseImmediateBacktracks(start, candidate);
    const key = pathToKey(normalized);
    if (!deduped.has(key)) {
      deduped.set(key, normalized);
    }
  }

  return [...deduped.values()].slice(0, ESCAPE_CANDIDATE_LIMIT);
}

function scoreEscapePathAgainstEnemyAttackCandidates(
  start: Position,
  threatPosition: Position,
  candidatePath: Position[],
  threatCandidates: {
    candidates: WeightedPathCandidate[];
    heatmap: Map<string, number>;
    timeHeatmap: Map<string, number>;
    bottleneckHeatmap: Map<string, number>;
  },
  obstacles: Position[],
  pathPoints: number,
  futureThreatCache: Map<string, ReturnType<typeof buildThreatAttackCandidates>>,
): EscapePathScore {
  const escapeSequence = [start, ...candidatePath];
  const uniqueEscapeKeys = new Set(escapeSequence.map((step) => toKey(step)));
  let score = 0;
  let exactDangerCount = 0;
  let crossingDangerCount = 0;

  for (const threatCandidate of threatCandidates.candidates) {
    const attackSequence = [threatPosition, ...threatCandidate.path];
    let candidateDanger = 0;
    let exactDanger = false;
    let crossingDanger = false;

    const maxSteps = Math.max(escapeSequence.length, attackSequence.length);
    for (let step = 0; step < maxSteps; step++) {
      const escapeCurrent =
        escapeSequence[Math.min(step, escapeSequence.length - 1)];
      const escapePrev =
        step > 0
          ? escapeSequence[Math.min(step - 1, escapeSequence.length - 1)]
          : escapeSequence[0];
      const attackCurrent =
        attackSequence[Math.min(step, attackSequence.length - 1)];
      const attackPrev =
        step > 0
          ? attackSequence[Math.min(step - 1, attackSequence.length - 1)]
          : attackSequence[0];

      if (sameCell(escapeCurrent, attackCurrent)) {
        candidateDanger += ESCAPE_SCORE_WEIGHTS.exactCollisionDanger;
        exactDanger = true;
      } else if (
        sameCell(escapePrev, attackCurrent) &&
        sameCell(escapeCurrent, attackPrev)
      ) {
        candidateDanger += ESCAPE_SCORE_WEIGHTS.crossingCollisionDanger;
        crossingDanger = true;
      } else {
        const distance = manhattan(escapeCurrent, attackCurrent);
        if (distance === 1) {
          candidateDanger += ESCAPE_SCORE_WEIGHTS.adjacentDanger;
        } else if (
          sameCell(escapeCurrent, attackPrev) ||
          sameCell(escapePrev, attackCurrent)
        ) {
          candidateDanger += ESCAPE_SCORE_WEIGHTS.sameTileDifferentTimeDanger;
        }
      }
    }

    if (exactDanger) exactDangerCount += 1;
    if (crossingDanger) crossingDangerCount += 1;
    score -= candidateDanger * threatCandidate.weight;
  }

  const dangerExposure = sumHeat(uniqueEscapeKeys, threatCandidates.heatmap);
  const timedDangerExposure = escapeSequence.reduce((sum, position, step) => {
    return (
      sum + (threatCandidates.timeHeatmap.get(`${step}:${toKey(position)}`) ?? 0)
    );
  }, 0);
  const bottleneckDanger = sumHeat(
    uniqueEscapeKeys,
    threatCandidates.bottleneckHeatmap,
  );
  const finalPosition = candidatePath[candidatePath.length - 1] ?? start;
  const finalMobility = countOpenNeighbors(finalPosition, obstacles);
  const futureMobility = getNeighbors(finalPosition, obstacles).reduce(
    (sum, neighbor) => sum + countOpenNeighbors(neighbor, obstacles),
    0,
  );
  const distanceFromThreat = manhattan(finalPosition, threatPosition);
  const centerFlexibility = isEdge(finalPosition) ? 0 : 1;
  const cornerTrapPenalty = isCorner(finalPosition) ? 1 : 0;
  const edgeTrapPenalty = isEdge(finalPosition) ? 1 : 0;
  const bottleneckTrapPenalty = finalMobility <= 2 ? 1 : 0;
  const lowMobilityPenalty = finalMobility <= 1 ? 1 : 0;
  const directLinePenalty = isDirectRetreatLine(
    start,
    finalPosition,
    threatPosition,
  )
    ? 1
    : 0;
  const futureThreat = getFutureThreatModel(
    threatPosition,
    finalPosition,
    pathPoints,
    obstacles,
    futureThreatCache,
  );
  const finalRegionKeys = new Set([
    toKey(finalPosition),
    ...getNeighbors(finalPosition, obstacles).map((neighbor) => toKey(neighbor)),
  ]);
  const futureDangerExposure = sumHeat(finalRegionKeys, futureThreat.heatmap);
  const futureBottleneckDanger = sumHeat(
    finalRegionKeys,
    futureThreat.bottleneckHeatmap,
  );
  const safeExitCount = getNeighbors(finalPosition, obstacles).filter(
    (neighbor) =>
      (futureThreat.heatmap.get(toKey(neighbor)) ?? 0) <=
      (futureThreat.heatmap.get(toKey(finalPosition)) ?? 0),
  ).length;

  score -= dangerExposure * ESCAPE_SCORE_WEIGHTS.dangerHeat;
  score -= timedDangerExposure * ESCAPE_SCORE_WEIGHTS.timedDangerHeat;
  score -= bottleneckDanger * ESCAPE_SCORE_WEIGHTS.bottleneckDanger;
  score += finalMobility * ESCAPE_SCORE_WEIGHTS.finalMobility;
  score += futureMobility * ESCAPE_SCORE_WEIGHTS.futureMobility;
  score += distanceFromThreat * ESCAPE_SCORE_WEIGHTS.distanceFromThreat;
  score += centerFlexibility * ESCAPE_SCORE_WEIGHTS.centerFlexibility;
  score += safeExitCount * (ESCAPE_SCORE_WEIGHTS.futureMobility + 2);
  score -= cornerTrapPenalty * ESCAPE_SCORE_WEIGHTS.cornerTrapPenalty;
  score -= edgeTrapPenalty * ESCAPE_SCORE_WEIGHTS.edgeTrapPenalty;
  score -= bottleneckTrapPenalty * ESCAPE_SCORE_WEIGHTS.bottleneckTrapPenalty;
  score -= lowMobilityPenalty * ESCAPE_SCORE_WEIGHTS.lowMobilityPenalty;
  score -= directLinePenalty * ESCAPE_SCORE_WEIGHTS.directLinePenalty;
  score -= futureDangerExposure * (ESCAPE_SCORE_WEIGHTS.dangerHeat * 0.7);
  score -= futureBottleneckDanger * (ESCAPE_SCORE_WEIGHTS.bottleneckDanger * 0.7);

  return {
    path: candidatePath,
    score,
    exactDangerCount,
    crossingDangerCount,
    dangerExposure,
    timedDangerExposure,
    finalMobility,
    futureMobility,
  };
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

function scoreEscapeExpansionHeuristic(
  candidate: Position,
  threatPosition: Position,
  depth: number,
  obstacles: Position[],
): number {
  return (
    countOpenNeighbors(candidate, obstacles) * 6.1 +
    getNeighbors(candidate, obstacles).reduce(
      (sum, neighbor) => sum + countOpenNeighbors(neighbor, obstacles),
      0,
    ) * 0.9 +
    manhattan(candidate, threatPosition) * 5.8 +
    (isCorner(candidate) ? -7.5 : isEdge(candidate) ? -2.4 : 2.6) -
    depth * 0.18
  );
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

function buildThreatAttackTargets(
  attackerPosition: Position,
  targetPosition: Position,
  obstacles: Position[],
): Array<{ target: Position; priority: number }> {
  const byKey = new Map<string, { target: Position; priority: number }>();
  const register = (target: Position, priority: number) => {
    const key = toKey(target);
    const existing = byKey.get(key);
    if (!existing || priority > existing.priority) {
      byKey.set(key, { target, priority });
    }
  };

  register(targetPosition, 28);
  for (const neighbor of getNeighbors(targetPosition, obstacles)) {
    register(
      neighbor,
      22 + Math.max(0, 4 - manhattan(neighbor, attackerPosition)) * 2,
    );
  }

  for (const cell of listBoardPositions()) {
    if (isBlocked(cell, obstacles) || sameCell(cell, targetPosition)) continue;
    const distanceToTarget = manhattan(cell, targetPosition);
    if (distanceToTarget > 3) continue;
    const mobility = countOpenNeighbors(cell, obstacles);
    const priority =
      Math.max(0, 5 - distanceToTarget) * 3 +
      (isEdge(cell) ? 0.5 : 2.4) +
      mobility * 0.8;
    register(cell, priority);
  }

  return [...byKey.values()]
    .sort((left, right) => right.priority - left.priority)
    .slice(0, 8);
}

function getFutureThreatModel(
  threatPosition: Position,
  targetPosition: Position,
  pathPoints: number,
  obstacles: Position[],
  cache: Map<string, ReturnType<typeof buildThreatAttackCandidates>>,
) {
  const key = toKey(targetPosition);
  const cached = cache.get(key);
  if (cached) return cached;

  const created = buildThreatAttackCandidates(
    threatPosition,
    targetPosition,
    pathPoints,
    obstacles,
  );
  cache.set(key, created);
  return created;
}

function pickWeightedTopThree<T>(candidates: T[]): T | undefined {
  if (candidates.length === 0) return undefined;
  const roll = Math.random();
  if (roll < 0.6 || candidates.length === 1) return candidates[0];
  if (roll < 0.9 || candidates.length === 2) return candidates[1];
  return candidates[2] ?? candidates[1] ?? candidates[0];
}

function chooseSafeEscapeCandidate(
  candidates: EscapePathScore[],
): EscapePathScore | null {
  if (candidates.length === 0) return null;

  const floor = candidates[candidates.length - 1]?.score ?? 0;
  const weighted = candidates.map((candidate, index) => ({
    candidate,
    weight: Math.max(1, candidate.score - floor + 4) + (candidates.length - index),
  }));
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let roll = Math.random() * totalWeight;

  for (const entry of weighted) {
    roll -= entry.weight;
    if (roll <= 0) {
      return entry.candidate;
    }
  }

  return candidates[0];
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

function listBoardPositions(): Position[] {
  const positions: Position[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      positions.push({ row, col });
    }
  }
  return positions;
}

function manhattan(a: Position, b: Position): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

function isEdge(position: Position): boolean {
  return position.row === 0 || position.row === 4 || position.col === 0 || position.col === 4;
}

function isCorner(position: Position): boolean {
  const topOrBottom = position.row === 0 || position.row === 4;
  const leftOrRight = position.col === 0 || position.col === 4;
  return topOrBottom && leftOrRight;
}

function isSamePosition(a: Position, b: Position | null): boolean {
  return !!b && a.row === b.row && a.col === b.col;
}

function sameCell(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

function isDirectRetreatLine(
  start: Position,
  end: Position,
  threat: Position,
): boolean {
  const startDistance = manhattan(start, threat);
  const endDistance = manhattan(end, threat);
  return endDistance > startDistance && (start.row === end.row || start.col === end.col);
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
