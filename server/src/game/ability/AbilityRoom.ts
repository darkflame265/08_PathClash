import { Server, Socket } from 'socket.io';
import type { BoardSkin, PieceSkin, PlayerColor, Position } from '../../types/game.types';
import {
  calcAnimationDuration,
  calcPathPoints,
  generateObstacles,
  getInitialPositions,
  isValidMove,
  isValidPath,
  toClientPlayer,
} from '../GameEngine';
import { createAiPath } from '../AiPlanner';
import { ServerTimer } from '../ServerTimer';
import {
  recordMatchmakingLoss,
  recordMatchmakingResult,
  recordMatchmakingWin,
} from '../../services/playerAuth';
import {
  recordAbilityBlockEvents,
  recordAbilitySkillFinish,
  recordAbilitySpecialWin,
  recordAbilityUtilityUsage,
  recordMatchPlayed,
  recordModeWin,
} from '../../services/achievementService';
import {
  ABILITY_SKILL_COSTS,
  ABILITY_SKILL_SERVER_RULES,
  type AbilityBattleState,
  type AbilityResolutionPayload,
  type AbilityLavaTile,
  type AbilityTrapTile,
  type AbilityPlayerState,
  type AbilityRoundStartPayload,
  type AbilitySkillId,
  type AbilitySkillReservation,
  type AbilityTurnSnapshot,
} from './AbilityTypes';
import { resolveAbilityRound } from './AbilityEngine';

const PLANNING_TIME_MS = 9000;
const SUBMIT_GRACE_MS = 350;
const INITIAL_MANA = 4;
const MAX_MANA = 10;
const MANA_PER_TURN = 2;
const SKILL_EVENT_BUFFER_MS = 1100;
const AT_FIELD_END_DELAY_MS = 700;
const TIME_REWIND_FREEZE_MS = 600;
const TIME_REWIND_HP_STEP_MS = 120;
const OVERDRIVE_MANA = 20;
const ABILITY_STARTING_HP = 5;
const TRAINING_STARTING_MANA = 10;
const TRAINING_PATH_POINTS = 10;
const TRAINING_DUMMY_POSITION: Position = { row: 2, col: 2 };
const ABILITY_FAKE_AI_DEBUG_LOG = false;
const ABILITY_FAKE_AI_SKILL_POOL: AbilitySkillId[] = [
  'classic_guard',
  'ember_blast',
  'nova_blast',
  'inferno_field',
  'quantum_shift',
  'cosmic_bigbang',
  'arc_reactor_field',
  'electric_blitz',
  'wizard_magic_mine',
  'chronos_time_rewind',
  'atomic_fission',
  'sun_chariot',
  'aurora_heal',
];

type BotActionCandidate = {
  path: Position[];
  skills: AbilitySkillReservation[];
  score: number;
  reason: string;
  selectedSkill: AbilitySkillId | null;
};

type BotPathModel = {
  paths: Position[][];
  heatmap: Map<string, number>;
  timeHeatmap: Map<string, number>;
  hotspotCells: Position[];
};

function collectUtilitySkillUsageByUser(
  players: Map<PlayerColor, AbilityPlayerState>,
  skillEvents: Array<{ color: PlayerColor; skillId: AbilitySkillId }>,
): Record<string, string[]> {
  const usage = new Map<string, string[]>();
  for (const event of skillEvents) {
    if (
      event.skillId !== 'aurora_heal' &&
      event.skillId !== 'quantum_shift' &&
      event.skillId !== 'plasma_charge' &&
      event.skillId !== 'void_cloak' &&
      event.skillId !== 'phase_shift' &&
      event.skillId !== 'gold_overdrive' &&
      event.skillId !== 'wizard_magic_mine' &&
      event.skillId !== 'chronos_time_rewind'
    ) {
      continue;
    }
    const userId = players.get(event.color)?.userId;
    if (!userId) continue;
    const current = usage.get(userId) ?? [];
    current.push(event.skillId);
    usage.set(userId, current);
  }
  return Object.fromEntries(usage);
}

function collectBlockEventsByUser(
  players: Map<PlayerColor, AbilityPlayerState>,
  blocks: Array<{ color: PlayerColor; skillId: 'classic_guard' | 'arc_reactor_field' }>,
): Record<string, Array<'classic_guard' | 'arc_reactor_field'>> {
  const result = new Map<string, Array<'classic_guard' | 'arc_reactor_field'>>();
  for (const block of blocks) {
    const userId = players.get(block.color)?.userId;
    if (!userId) continue;
    const current = result.get(userId) ?? [];
    current.push(block.skillId);
    result.set(userId, current);
  }
  return Object.fromEntries(result);
}

function findFinisherSkillId(
  loserColor: PlayerColor,
  skillEvents: Array<{
    skillId: AbilitySkillId;
    damages?: Array<{ color: PlayerColor; newHp: number }>;
  }>,
): AbilitySkillId | null {
  for (let index = skillEvents.length - 1; index >= 0; index -= 1) {
    const event = skillEvents[index];
    const killedTarget = event.damages?.some(
      (damage) => damage.color === loserColor && damage.newHp <= 0,
    );
    if (!killedTarget) continue;
    if (
      event.skillId === 'ember_blast' ||
      event.skillId === 'atomic_fission' ||
      event.skillId === 'inferno_field' ||
      event.skillId === 'nova_blast' ||
      event.skillId === 'sun_chariot' ||
      event.skillId === 'electric_blitz' ||
      event.skillId === 'cosmic_bigbang' ||
      event.skillId === 'wizard_magic_mine'
    ) {
      return event.skillId;
    }
  }
  return null;
}

function posEqual(a: Position, b: Position): boolean {
  return a.row === b.row && a.col === b.col;
}

function toKey(position: Position): string {
  return `${position.row},${position.col}`;
}

function inBoard(position: Position): boolean {
  return (
    position.row >= 0 &&
    position.row <= 4 &&
    position.col >= 0 &&
    position.col <= 4
  );
}

function manhattan(a: Position, b: Position): number {
  return Math.abs(a.row - b.row) + Math.abs(a.col - b.col);
}

function isObstacle(position: Position, obstacles: Position[]): boolean {
  return obstacles.some((obstacle) => posEqual(obstacle, position));
}

function getCardinalNeighbors(position: Position, obstacles: Position[]): Position[] {
  return [
    { row: position.row - 1, col: position.col },
    { row: position.row + 1, col: position.col },
    { row: position.row, col: position.col - 1 },
    { row: position.row, col: position.col + 1 },
  ].filter(
    (candidate) =>
      inBoard(candidate) &&
      isValidMove(position, candidate) &&
      !isObstacle(candidate, obstacles),
  );
}

function getAdjacentBlinkTargets(
  origin: Position,
  obstacles: Position[],
  forbidden?: Position,
): Position[] {
  const targets: Position[] = [];
  for (let rowDelta = -1; rowDelta <= 1; rowDelta += 1) {
    for (let colDelta = -1; colDelta <= 1; colDelta += 1) {
      if (rowDelta === 0 && colDelta === 0) continue;
      const target = { row: origin.row + rowDelta, col: origin.col + colDelta };
      if (!inBoard(target)) continue;
      if (isObstacle(target, obstacles)) continue;
      if (forbidden && posEqual(target, forbidden)) continue;
      targets.push(target);
    }
  }
  return targets;
}

function listBoardPositions(): Position[] {
  const positions: Position[] = [];
  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      positions.push({ row, col });
    }
  }
  return positions;
}

function pathKey(path: Position[]): string {
  return path.map((position) => toKey(position)).join('>');
}

function buildShortestAbilityPath(
  from: Position,
  to: Position,
  obstacles: Position[],
): Position[] {
  if (posEqual(from, to)) return [];
  const queue: Position[] = [{ ...from }];
  const visited = new Set<string>([toKey(from)]);
  const previous = new Map<string, string>();
  const positionMap = new Map<string, Position>([[toKey(from), { ...from }]]);
  const targetKey = toKey(to);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentKey = toKey(current);
    if (currentKey === targetKey) break;

    for (const next of getCardinalNeighbors(current, obstacles)) {
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
  while (cursor !== toKey(from)) {
    const position = positionMap.get(cursor);
    if (!position) break;
    reversedPath.push(position);
    cursor = previous.get(cursor)!;
  }

  return reversedPath.reverse();
}

function getSequencePosition(
  start: Position,
  path: Position[],
  step: number,
): Position {
  if (step <= 0) return start;
  return path[Math.min(step - 1, path.length - 1)] ?? start;
}

// targetPos에서 출발해 loopStart 방향으로 역행하지 않고 targetPos로 돌아오는
// 최단 복귀 사이클을 BFS로 탐색한다.
// 반환값: [첫 이동 셀, ..., targetPos] 형태의 루프 세그먼트 (접근 경로 이후 반복 삽입용)
function findShortestReturnCycle(
  targetPos: Position,
  loopStart: Position,
  obstacles: Position[],
  maxLen: number,
): Position[] | null {
  if (maxLen < 4) return null; // 역행 없는 최소 루프는 4스텝(사각형)

  type State = { pos: Position; prev: Position; path: Position[] };
  const visited = new Set<string>();
  const queue: State[] = [];

  // 첫 스텝: loopStart 방향 역행 금지
  for (const neighbor of getCardinalNeighbors(targetPos, obstacles)) {
    if (posEqual(neighbor, loopStart)) continue;
    const key = `${toKey(neighbor)}|${toKey(targetPos)}`;
    if (!visited.has(key)) {
      visited.add(key);
      queue.push({ pos: neighbor, prev: targetPos, path: [neighbor] });
    }
  }

  while (queue.length > 0) {
    const state = queue.shift()!;
    if (state.path.length >= maxLen) continue;

    for (const neighbor of getCardinalNeighbors(state.pos, obstacles)) {
      if (posEqual(neighbor, state.prev)) continue; // 직전 타일 역행 금지

      // targetPos로 복귀 성공 → 루프 세그먼트 반환
      if (posEqual(neighbor, targetPos)) {
        return [...state.path, targetPos];
      }

      const key = `${toKey(neighbor)}|${toKey(state.pos)}`;
      if (!visited.has(key)) {
        visited.add(key);
        queue.push({ pos: neighbor, prev: state.pos, path: [...state.path, neighbor] });
      }
    }
  }

  return null;
}

function buildBotPathModel(params: {
  start: Position;
  opponent: Position;
  role: 'attacker' | 'escaper';
  pathPoints: number;
  obstacles: Position[];
}): BotPathModel {
  const { start, opponent, role, pathPoints, obstacles } = params;
  const candidates: Array<{ path: Position[]; score: number }> = [];
  const primary = createAiPath({
    color: 'red',
    role,
    selfPosition: start,
    opponentPosition: opponent,
    pathPoints,
    obstacles,
  });
  candidates.push({ path: primary, score: 999 });

  for (const cell of listBoardPositions()) {
    if (posEqual(cell, start) || isObstacle(cell, obstacles)) continue;
    const path = buildShortestAbilityPath(start, cell, obstacles).slice(
      0,
      pathPoints,
    );
    if (path.length === 0 || path.length > pathPoints) continue;
    const finalPosition = path[path.length - 1] ?? start;
    const openNeighbors = getCardinalNeighbors(finalPosition, obstacles).length;
    const heuristic =
      role === 'attacker'
        ? Math.max(0, 6 - manhattan(finalPosition, opponent)) * 8 +
          openNeighbors * 2
        : manhattan(finalPosition, opponent) * 7 +
          openNeighbors * 3 -
          (finalPosition.row === 0 ||
          finalPosition.row === 4 ||
          finalPosition.col === 0 ||
          finalPosition.col === 4
            ? 2
            : 0);
    candidates.push({ path, score: heuristic });
  }

  const deduped = new Map<string, { path: Position[]; score: number }>();
  for (const candidate of candidates) {
    const key = pathKey(candidate.path);
    const existing = deduped.get(key);
    if (!existing || candidate.score > existing.score) {
      deduped.set(key, candidate);
    }
  }

  const paths = [...deduped.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, 20)
    .map((entry) => entry.path);

  const heatmap = new Map<string, number>();
  const timeHeatmap = new Map<string, number>();
  for (const path of paths) {
    const sequence = [start, ...path];
    for (let index = 0; index < sequence.length; index += 1) {
      const key = toKey(sequence[index]);
      heatmap.set(key, (heatmap.get(key) ?? 0) + 1);
      timeHeatmap.set(`${index}:${key}`, (timeHeatmap.get(`${index}:${key}`) ?? 0) + 1);
    }
  }

  const hotspotCells = [...heatmap.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, 8)
    .map(([key]) => {
      const [row, col] = key.split(',').map(Number);
      return { row, col };
    });

  return { paths, heatmap, timeHeatmap, hotspotCells };
}

function scoreAttackPathAgainstModel(
  start: Position,
  path: Position[],
  opponentStart: Position,
  enemyModel: BotPathModel,
  obstacles: Position[],
): number {
  const mySequence = [start, ...path];
  let score = 0;

  for (const enemyPath of enemyModel.paths) {
    const enemySequence = [opponentStart, ...enemyPath];
    const maxSteps = Math.max(mySequence.length, enemySequence.length);
    for (let step = 0; step < maxSteps; step += 1) {
      const myCurrent = mySequence[Math.min(step, mySequence.length - 1)];
      const enemyCurrent = enemySequence[Math.min(step, enemySequence.length - 1)];
      const myPrev = mySequence[Math.max(0, Math.min(step - 1, mySequence.length - 1))];
      const enemyPrev =
        enemySequence[Math.max(0, Math.min(step - 1, enemySequence.length - 1))];

      if (posEqual(myCurrent, enemyCurrent)) {
        score += 240;
      } else if (posEqual(myCurrent, enemyPrev) && posEqual(enemyCurrent, myPrev)) {
        score += 200;
      } else {
        const distance = manhattan(myCurrent, enemyCurrent);
        if (distance === 1) score += 24;
      }
    }
  }

  for (const step of mySequence) {
    score += (enemyModel.heatmap.get(toKey(step)) ?? 0) * 10;
  }
  for (let index = 0; index < mySequence.length; index += 1) {
    score += (enemyModel.timeHeatmap.get(`${index}:${toKey(mySequence[index])}`) ?? 0) * 12;
  }

  const finalPosition = path[path.length - 1] ?? start;
  score += getCardinalNeighbors(finalPosition, obstacles).length * 6;
  return score;
}

function scoreEscapePathAgainstModel(
  start: Position,
  path: Position[],
  opponentStart: Position,
  threatModel: BotPathModel,
  obstacles: Position[],
): number {
  const mySequence = [start, ...path];
  let score = 0;

  for (const enemyPath of threatModel.paths) {
    const enemySequence = [opponentStart, ...enemyPath];
    const maxSteps = Math.max(mySequence.length, enemySequence.length);
    for (let step = 0; step < maxSteps; step += 1) {
      const myCurrent = mySequence[Math.min(step, mySequence.length - 1)];
      const enemyCurrent = enemySequence[Math.min(step, enemySequence.length - 1)];
      const myPrev = mySequence[Math.max(0, Math.min(step - 1, mySequence.length - 1))];
      const enemyPrev =
        enemySequence[Math.max(0, Math.min(step - 1, enemySequence.length - 1))];

      if (posEqual(myCurrent, enemyCurrent)) {
        score -= 260;
      } else if (posEqual(myCurrent, enemyPrev) && posEqual(enemyCurrent, myPrev)) {
        score -= 220;
      } else {
        const distance = manhattan(myCurrent, enemyCurrent);
        if (distance === 1) score -= 30;
      }
    }
  }

  for (const step of mySequence) {
    score -= (threatModel.heatmap.get(toKey(step)) ?? 0) * 12;
  }
  for (let index = 0; index < mySequence.length; index += 1) {
    score -= (threatModel.timeHeatmap.get(`${index}:${toKey(mySequence[index])}`) ?? 0) * 14;
  }

  const finalPosition = path[path.length - 1] ?? start;
  const finalMobility = getCardinalNeighbors(finalPosition, obstacles).length;
  const futureMobility = getCardinalNeighbors(finalPosition, obstacles).reduce(
    (sum, neighbor) => sum + getCardinalNeighbors(neighbor, obstacles).length,
    0,
  );
  score += manhattan(finalPosition, opponentStart) * 9;
  score += finalMobility * 16;
  score += futureMobility * 5;
  if (
    finalPosition.row === 0 ||
    finalPosition.row === 4 ||
    finalPosition.col === 0 ||
    finalPosition.col === 4
  ) {
    score -= 8;
  }
  return score;
}

function buildBlitzPath(start: Position, target: Position): Position[] {
  const rowDelta = target.row - start.row;
  const colDelta = target.col - start.col;
  const rowStep = rowDelta === 0 ? 0 : rowDelta > 0 ? 1 : -1;
  const colStep = colDelta === 0 ? 0 : colDelta > 0 ? 1 : -1;

  if (Math.abs(rowDelta) + Math.abs(colDelta) !== 1) return [];

  const path: Position[] = [];
  let row = start.row + rowStep;
  let col = start.col + colStep;
  while (row >= 0 && row <= 4 && col >= 0 && col <= 4) {
    path.push({ row, col });
    row += rowStep;
    col += colStep;
  }
  return path;
}

function getBlitzDirectionTowardOpponent(
  self: Position,
  opponent: Position,
): Position | null {
  if (self.row === opponent.row) {
    return {
      row: self.row,
      col: self.col + (opponent.col > self.col ? 1 : -1),
    };
  }
  if (self.col === opponent.col) {
    return {
      row: self.row + (opponent.row > self.row ? 1 : -1),
      col: self.col,
    };
  }
  return null;
}

function getCrossPositions(origin: Position): Position[] {
  return [
    origin,
    { row: origin.row - 1, col: origin.col },
    { row: origin.row + 1, col: origin.col },
    { row: origin.row, col: origin.col - 1 },
    { row: origin.row, col: origin.col + 1 },
  ].filter((position) => inBoard(position));
}

function getNovaPositions(origin: Position): Position[] {
  const positions: Position[] = [origin];
  for (const distance of [1, 2]) {
    positions.push(
      { row: origin.row - distance, col: origin.col - distance },
      { row: origin.row - distance, col: origin.col + distance },
      { row: origin.row + distance, col: origin.col - distance },
      { row: origin.row + distance, col: origin.col + distance },
    );
  }
  return positions.filter((position) => inBoard(position));
}

function getSquarePositions(origin: Position, radius = 1): Position[] {
  const positions: Position[] = [];
  for (let row = origin.row - radius; row <= origin.row + radius; row += 1) {
    for (let col = origin.col - radius; col <= origin.col + radius; col += 1) {
      const position = { row, col };
      if (!inBoard(position)) continue;
      positions.push(position);
    }
  }
  return positions;
}

function getRandomTeleportPosition(
  current: Position,
  opponent: Position,
): Position {
  const candidates: Position[] = [];
  for (let row = 0; row < 5; row++) {
    for (let col = 0; col < 5; col++) {
      if (row === opponent.row && col === opponent.col) continue;
      candidates.push({ row, col });
    }
  }
  const filtered = candidates.filter((position) => !posEqual(position, current));
  const pool = filtered.length > 0 ? filtered : candidates;
  return pool[Math.floor(Math.random() * pool.length)];
}

function normalizeSkillReservations(
  skills: AbilitySkillReservation[],
): AbilitySkillReservation[] {
  return Array.from(new Map(skills.map((skill) => [skill.skillId, skill])).values())
    .map((skill) => ({ ...skill, target: skill.target ?? null }))
    .sort((left, right) => left.order - right.order);
}

function validateSkillRoleRestrictions(
  player: AbilityPlayerState,
  skills: AbilitySkillReservation[],
): boolean {
  return skills.every((skill) => {
    const { roleRestriction } = ABILITY_SKILL_SERVER_RULES[skill.skillId];
    if (roleRestriction === 'attacker') return player.role === 'attacker';
    if (roleRestriction === 'escaper') return player.role === 'escaper';
    return true;
  });
}

function validateCommonSkillReservations(
  player: AbilityPlayerState,
  skills: AbilitySkillReservation[],
  path: Position[],
  isOverdriveTurn: boolean,
): boolean {
  const pathLength = path.length;
  const hasExclusiveSkill = skills.some(
    (skill) => ABILITY_SKILL_SERVER_RULES[skill.skillId].exclusiveWhenNotOverdrive,
  );

  if (!isOverdriveTurn && hasExclusiveSkill && skills.length !== 1) {
    return false;
  }

  return skills.every((skill) => {
    const rule = ABILITY_SKILL_SERVER_RULES[skill.skillId];

    if (skill.step < 0 || skill.step > pathLength) return false;
    if (rule.targetRule === 'position' && !skill.target) return false;
    if (rule.stepRule === 'zero_only' && skill.step !== 0) return false;
    if (!isOverdriveTurn && rule.maxStep !== undefined && skill.step > rule.maxStep) return false;

    if (
      !isOverdriveTurn &&
      rule.requiresEmptyPathWhenNotOverdrive &&
      pathLength > 0
    ) {
      return false;
    }

    if (
      rule.requiresPreviousTurnPath &&
      (!player.previousTurnStart || player.previousTurnPath.length === 0)
    ) {
      return false;
    }

    return true;
  });
}

export class AbilityRoom {
  readonly roomId: string;
  readonly code: string;
  private readonly io: Server;
  private readonly timer = new ServerTimer();
  private readonly createdAt = Date.now();
  private lastActivityAt = Date.now();
  private players: Map<PlayerColor, AbilityPlayerState> = new Map();
  private phase: AbilityBattleState['phase'] = 'waiting';
  private turn = 1;
  private attackerColor: PlayerColor = 'red';
  private obstacles: Position[] = [];
  private lavaTiles: AbilityLavaTile[] = [];
  private trapTiles: AbilityTrapTile[] = [];
  // 4코 스킬 연속 사용 방지: 마지막으로 4코 스킬을 사용한 턴 번호 추적
  private botLastFourCostSkillTurn: Map<PlayerColor, number> = new Map();
  private readySockets = new Set<string>();
  private pendingStart = false;
  private pendingStartPaused = false;
  private trainingMode = false;
  private privateMatch = false;
  private rematchSet = new Set<string>();
  private planningGraceTimeout: ReturnType<typeof setTimeout> | null = null;
  private movingCompleteTimeout: ReturnType<typeof setTimeout> | null = null;
  private nextRoundTimeout: ReturnType<typeof setTimeout> | null = null;
  private rewardsGranted = false;

  constructor(roomId: string, code: string, io: Server) {
    this.roomId = roomId;
    this.code = code;
    this.io = io;
  }

  get playerCount(): number {
    return this.players.size;
  }

  get isFull(): boolean {
    return this.players.size === 2;
  }

  get currentPhase(): AbilityBattleState['phase'] {
    return this.phase;
  }

  get createdTimestamp(): number {
    return this.createdAt;
  }

  get lastActivityTimestamp(): number {
    return this.lastActivityAt;
  }
  get currentTurn(): number {
    return this.turn;
  }

  getSocketIds(): string[] {
    return [...this.players.values()].map((player) => player.socketId);
  }

  enableTrainingMode(): void {
    this.trainingMode = true;
  }

  enablePrivateMatch(): void {
    this.privateMatch = true;
  }

  isRewardEligible(): boolean {
    return !this.trainingMode && !this.privateMatch;
  }

  addPlayer(
    socket: Socket,
    nickname: string,
    userId: string | null,
    stats: { wins: number; losses: number },
    pieceSkin: PieceSkin,
    boardSkin: BoardSkin,
    equippedSkills: AbilitySkillId[],
  ): PlayerColor | null {
    if (this.isFull) return null;
    const color: PlayerColor = this.players.size === 0 ? 'red' : 'blue';
    const initialPositions = getInitialPositions();
    this.players.set(color, {
      id: userId ?? socket.id,
      userId,
      socketId: socket.id,
      isBot: false,
      nickname,
      color,
      pieceSkin,
      boardSkin,
      hp: ABILITY_STARTING_HP,
      position: { ...initialPositions[color] },
      plannedPath: [],
      previousTurnStart: null,
      previousTurnPath: [],
      plannedSkills: [],
      pathSubmitted: false,
      role: color === 'red' ? 'attacker' : 'escaper',
      stats,
      disconnectLossRecorded: false,
      mana: this.trainingMode ? TRAINING_STARTING_MANA : INITIAL_MANA,
      invulnerableSteps: 0,
      pendingManaBonus: 0,
      pendingOverdriveStage: 0,
      pendingVoidCloak: false,
      overdriveActive: false,
      reboundLocked: false,
      hidden: false,
      equippedSkills,
      timeRewindUsed: false,
      turnHistory: [],
    });
    socket.join(this.roomId);
    this.touchActivity();
    return color;
  }

  addIdleBot(
    nickname: string,
    pieceSkin: PieceSkin,
    boardSkin: BoardSkin,
    equippedSkills: AbilitySkillId[] = [],
    options?: {
      displayId?: string;
      stats?: { wins: number; losses: number };
    },
  ): PlayerColor | null {
    if (this.isFull) return null;
    const color: PlayerColor = this.players.size === 0 ? 'red' : 'blue';
    const initialPositions = getInitialPositions();
    this.players.set(color, {
      id: options?.displayId ?? `bot:${this.roomId}:${color}`,
      userId: null,
      socketId: `bot:${this.roomId}:${color}`,
      isBot: true,
      nickname,
      color,
      pieceSkin,
      boardSkin,
      hp: ABILITY_STARTING_HP,
      position: this.trainingMode
        ? { ...TRAINING_DUMMY_POSITION }
        : { ...initialPositions[color] },
      plannedPath: [],
      previousTurnStart: null,
      previousTurnPath: [],
      plannedSkills: [],
      pathSubmitted: false,
      role: color === 'red' ? 'attacker' : 'escaper',
      stats: options?.stats ?? { wins: 0, losses: 0 },
      disconnectLossRecorded: false,
      mana: this.trainingMode ? TRAINING_STARTING_MANA : INITIAL_MANA,
      invulnerableSteps: 0,
      pendingManaBonus: 0,
      pendingOverdriveStage: 0,
      pendingVoidCloak: false,
      overdriveActive: false,
      reboundLocked: false,
      hidden: false,
      equippedSkills,
      timeRewindUsed: false,
      turnHistory: [],
    });
    this.touchActivity();
    return color;
  }

  prepareGameStart(startPaused = false): void {
    this.pendingStart = true;
    this.pendingStartPaused = startPaused;
    this.readySockets.clear();
    this.touchActivity();
  }

  markClientReady(socketId: string): boolean {
    if (!this.pendingStart) return false;
    const player = this.getPlayerBySocket(socketId);
    if (!player) return false;
    this.readySockets.add(socketId);
    this.touchActivity();
    const humanSocketIds = [...this.players.values()]
      .filter((entry) => !entry.isBot)
      .map((entry) => entry.socketId);
    const allReady =
      humanSocketIds.length > 0 &&
      humanSocketIds.every((id) => this.readySockets.has(id));
    if (!allReady) return false;
    this.startGame(this.pendingStartPaused);
    return true;
  }

  startGame(startPaused = false): void {
    this.pendingStart = false;
    this.pendingStartPaused = false;
    this.readySockets.clear();
    this.phase = startPaused ? 'waiting' : 'planning';
    this.turn = 1;
    this.attackerColor = 'red';
    this.rewardsGranted = false;
    this.botLastFourCostSkillTurn.clear();
    this.resetPlayers();
    this.updateRoles();
    this.touchActivity();
    for (const player of this.players.values()) {
      this.io.to(player.socketId).emit('ability_game_start', this.toClientState(player.color));
    }
    if (!startPaused) this.startRound();
  }

  updatePlayerSkin(socketId: string, pieceSkin: PieceSkin): void {
    const player = this.getPlayerBySocket(socketId);
    if (!player) return;
    player.pieceSkin = pieceSkin;
    this.touchActivity();
    this.io.to(this.roomId).emit('player_skin_updated', {
      color: player.color,
      pieceSkin,
    });
  }

  updatePlan(socketId: string, path: Position[], skills: AbilitySkillReservation[]): { acceptedPath: Position[]; acceptedSkills: AbilitySkillReservation[] } | null {
    if (this.phase !== 'planning') return null;
    const player = this.getPlayerBySocket(socketId);
    if (!player || player.pathSubmitted) return null;
    const validated = this.validatePlan(player, path, skills);
    if (!validated) return null;
    player.plannedPath = validated.path;
    player.plannedSkills = validated.skills;
    this.touchActivity();
    this.io.to(this.roomId).emit('ability_plan_updated', {
      color: player.color,
      path: validated.path,
      skills: validated.skills,
    });
    return {
      acceptedPath: validated.path,
      acceptedSkills: validated.skills,
    };
  }

  submitPlan(socketId: string, path: Position[], skills: AbilitySkillReservation[]): { ok: boolean; acceptedPath: Position[]; acceptedSkills: AbilitySkillReservation[] } {
    if (this.phase !== 'planning') return { ok: false, acceptedPath: [], acceptedSkills: [] };
    const player = this.getPlayerBySocket(socketId);
    if (!player || player.pathSubmitted) return { ok: false, acceptedPath: [], acceptedSkills: [] };

    const validated = this.validatePlan(player, path, skills) ?? this.validatePlan(player, player.plannedPath, player.plannedSkills) ?? { path: [], skills: [] };
    player.plannedPath = validated.path;
    player.plannedSkills = validated.skills;
    player.pathSubmitted = true;
    this.touchActivity();

    this.emitToOpponent(socketId, 'ability_opponent_submitted', {});
    this.io.to(this.roomId).emit('ability_player_submitted', {
      color: player.color,
      path: validated.path,
      skills: validated.skills,
    });

    const allSubmitted = [...this.players.values()].every((entry) => entry.pathSubmitted);
    if (allSubmitted) {
      this.timer.clear();
      this.revealPlans();
    }

    return { ok: true, acceptedPath: validated.path, acceptedSkills: validated.skills };
  }

  requestRematch(socketId: string): void {
    if (this.phase !== 'gameover') return;
    if (this.rematchSet.has(socketId)) return;
    this.rematchSet.add(socketId);
    this.touchActivity();
    if (this.rematchSet.size === 1) {
      this.emitToOpponent(socketId, 'rematch_requested', {});
      return;
    }
    this.rematchSet.clear();
    this.resetGame();
    this.startGame();
  }

  sendChat(socketId: string, message: string): void {
    const player = this.getPlayerBySocket(socketId);
    if (!player) return;
    const trimmed = message.slice(0, 200);
    this.touchActivity();
    this.io.to(this.roomId).emit('chat_receive', {
      sender: player.nickname,
      color: player.color,
      message: trimmed,
      timestamp: Date.now(),
    });
  }

  removePlayer(socketId: string): {
    disconnectedColor: PlayerColor | null;
    shouldAwardDisconnectResult: boolean;
    winnerColor: PlayerColor | null;
  } {
    let disconnectedColor: PlayerColor | null = null;
    let shouldAwardDisconnectResult = false;
    let winnerColor: PlayerColor | null = null;

    for (const [color, player] of this.players.entries()) {
      if (player.socketId !== socketId) continue;
      disconnectedColor = color;
      const wasActive = this.phase === 'planning' || this.phase === 'moving';
      if (wasActive && !player.isBot) {
        if (player.userId && !player.disconnectLossRecorded) {
          player.stats.losses += 1;
          player.disconnectLossRecorded = true;
          void recordMatchmakingLoss(player.userId);
        }
        player.connected = false;
        player.pathSubmitted = true;
        player.plannedPath = [];
        player.plannedSkills = [];
        this.readySockets.delete(socketId);
        this.touchActivity();
        if (this.phase === 'planning') {
          const allSubmitted = [...this.players.values()].every(
            (entry) => entry.pathSubmitted,
          );
          if (allSubmitted) {
            this.timer.clear();
            this.clearPlanningGraceTimeout();
            this.revealPlans();
          }
        }
        break;
      }
      this.players.delete(color);
      this.timer.clear();
      this.clearPendingTimeouts();
      this.readySockets.clear();
      this.pendingStart = false;
      this.pendingStartPaused = false;
      this.touchActivity();
      break;
    }

    return { disconnectedColor, shouldAwardDisconnectResult, winnerColor };
  }

  toClientState(forColor?: PlayerColor): AbilityBattleState {
    const red = this.players.get('red')!;
    const blue = this.players.get('blue')!;
    return {
      roomId: this.roomId,
      code: this.code,
      turn: this.turn,
      phase: this.phase,
      pathPoints: this.currentPathPoints(),
      obstacles: this.obstacles,
      lavaTiles: this.lavaTiles,
      trapTiles: forColor
        ? this.trapTiles.filter((trap) => trap.owner === forColor)
        : [],
      players: {
        red: this.toClientPlayer(red),
        blue: this.toClientPlayer(blue),
      },
      attackerColor: this.attackerColor,
    };
  }

  getPlayerByColor(color: PlayerColor): AbilityPlayerState | undefined {
    return this.players.get(color);
  }

  private startRound(): void {
    if (!this.hasBothPlayers()) return;
    this.phase = 'planning';
    const red = this.players.get('red');
    const blue = this.players.get('blue');
    if (!red || !blue) return;

    red.pathSubmitted = false;
    blue.pathSubmitted = false;
    red.plannedPath = [];
    blue.plannedPath = [];
    red.plannedSkills = [];
    blue.plannedSkills = [];
    if (red.connected === false) {
      red.pathSubmitted = true;
    }
    if (blue.connected === false) {
      blue.pathSubmitted = true;
    }
    red.hidden = false;
    blue.hidden = false;
    red.overdriveActive = false;
    blue.overdriveActive = false;
    red.reboundLocked = false;
    blue.reboundLocked = false;
    red.mana = Math.min(MAX_MANA, red.mana + MANA_PER_TURN);
    blue.mana = Math.min(MAX_MANA, blue.mana + MANA_PER_TURN);
    red.mana = Math.min(MAX_MANA, red.mana + red.pendingManaBonus);
    blue.mana = Math.min(MAX_MANA, blue.mana + blue.pendingManaBonus);
    red.pendingManaBonus = 0;
    blue.pendingManaBonus = 0;
    if (red.pendingOverdriveStage === 1) {
      red.mana = OVERDRIVE_MANA;
      red.overdriveActive = true;
      red.pendingOverdriveStage = 2;
    } else if (red.pendingOverdriveStage === 2) {
      red.mana = 0;
      red.reboundLocked = true;
      red.pendingOverdriveStage = 0;
    }
    if (blue.pendingOverdriveStage === 1) {
      blue.mana = OVERDRIVE_MANA;
      blue.overdriveActive = true;
      blue.pendingOverdriveStage = 2;
    } else if (blue.pendingOverdriveStage === 2) {
      blue.mana = 0;
      blue.reboundLocked = true;
      blue.pendingOverdriveStage = 0;
    }
    if (red.pendingVoidCloak) {
      red.position = getRandomTeleportPosition(red.position, blue.position);
      red.hidden = true;
      red.pendingVoidCloak = false;
    }
    if (blue.pendingVoidCloak) {
      blue.position = getRandomTeleportPosition(blue.position, red.position);
      blue.hidden = true;
      blue.pendingVoidCloak = false;
    }
    this.obstacles = generateObstacles(this.roomId, this.turn, red.position, blue.position);
    if (red.isBot) {
      this.planBotTurn(red, blue);
    }
    if (blue.isBot) {
      this.planBotTurn(blue, red);
    }
    this.recordTurnSnapshot(red);
    this.recordTurnSnapshot(blue);

    const now = Date.now();
    this.touchActivity(now);
    for (const player of this.players.values()) {
      const payload: AbilityRoundStartPayload = {
        timeLimit: PLANNING_TIME_MS / 1000,
        roundEndsAt: now + PLANNING_TIME_MS,
        state: this.toClientState(player.color),
      };
      this.io.to(player.socketId).emit('ability_round_start', payload);
    }
    this.timer.start(PLANNING_TIME_MS, () => this.onPlanningTimeout());
  }

  private onPlanningTimeout(): void {
    if (!this.hasBothPlayers()) return;
    this.clearPlanningGraceTimeout();
    this.planningGraceTimeout = setTimeout(() => {
      this.planningGraceTimeout = null;
      if (this.phase !== 'planning') return;
      for (const player of this.players.values()) {
        if (!player.pathSubmitted) {
          player.pathSubmitted = true;
        }
      }
      this.revealPlans();
    }, SUBMIT_GRACE_MS);
  }

  private revealPlans(): void {
    if (this.phase !== 'planning' || !this.hasBothPlayers()) return;
    this.phase = 'moving';
    const red = this.players.get('red');
    const blue = this.players.get('blue');
    if (!red || !blue) return;
    red.hidden = false;
    blue.hidden = false;

    const resolution = resolveAbilityRound({
      red,
      blue,
      attackerColor: this.attackerColor,
      obstacles: this.obstacles,
      lavaTiles: this.lavaTiles,
      trapTiles: this.trapTiles,
    });

    this.applyTimeRewindIfNeeded('red', red, resolution);
    this.applyTimeRewindIfNeeded('blue', blue, resolution);

    red.previousTurnStart = { ...resolution.payload.redStart };
    red.previousTurnPath = resolution.payload.redPath.map((position) => ({ ...position }));
    blue.previousTurnStart = { ...resolution.payload.blueStart };
    blue.previousTurnPath = resolution.payload.bluePath.map((position) => ({ ...position }));

    red.position = resolution.redState.position;
    red.hp = resolution.redState.hp;
    red.mana = resolution.redState.mana;
    red.invulnerableSteps = resolution.redState.invulnerableSteps;
    red.pendingManaBonus = resolution.redState.pendingManaBonus;
    red.pendingOverdriveStage = resolution.redState.pendingOverdriveStage;
    red.pendingVoidCloak = resolution.redState.pendingVoidCloak;
    red.overdriveActive = resolution.redState.overdriveActive;
    red.reboundLocked = resolution.redState.reboundLocked;
    blue.position = resolution.blueState.position;
    blue.hp = resolution.blueState.hp;
    blue.mana = resolution.blueState.mana;
    blue.invulnerableSteps = resolution.blueState.invulnerableSteps;
    blue.pendingManaBonus = resolution.blueState.pendingManaBonus;
    blue.pendingOverdriveStage = resolution.blueState.pendingOverdriveStage;
    blue.pendingVoidCloak = resolution.blueState.pendingVoidCloak;
    blue.overdriveActive = resolution.blueState.overdriveActive;
    blue.reboundLocked = resolution.blueState.reboundLocked;
    this.lavaTiles = resolution.lavaTiles;
    this.trapTiles = resolution.trapTiles;

    this.touchActivity();
    for (const player of this.players.values()) {
      this.io.to(player.socketId).emit('ability_resolution', {
        ...resolution.payload,
        trapTiles: this.trapTiles.filter((trap) => trap.owner === player.color),
      });
    }
    if (this.isRewardEligible()) {
      void recordAbilityUtilityUsage({
        byUserId: collectUtilitySkillUsageByUser(
          this.players,
          resolution.payload.skillEvents,
        ),
      });
      void recordAbilityBlockEvents({
        byUserId: collectBlockEventsByUser(this.players, resolution.payload.blocks),
      });
    }

    const atFieldEventCount = resolution.payload.skillEvents.filter(
      (event) => event.skillId === 'arc_reactor_field',
    ).length;
    const timeRewindExtraDelayMs = resolution.payload.skillEvents
      .filter((event) => event.skillId === 'chronos_time_rewind')
      .reduce((sum, event) => {
        const rewindTicks = Math.max(
          event.affectedPositions?.length ?? 0,
          event.rewindHp ?? 0,
        );
        const rewindDuration =
          TIME_REWIND_FREEZE_MS +
          rewindTicks * TIME_REWIND_HP_STEP_MS +
          40;
        return sum + Math.max(0, rewindDuration - SKILL_EVENT_BUFFER_MS);
      }, 0);

    const animTime = calcAnimationDuration(
      Math.max(red.plannedPath.length, blue.plannedPath.length) + resolution.payload.skillEvents.length,
    ) +
      resolution.payload.skillEvents.length * SKILL_EVENT_BUFFER_MS +
      atFieldEventCount * AT_FIELD_END_DELAY_MS +
      timeRewindExtraDelayMs;

    this.clearMovingCompleteTimeout();
    this.movingCompleteTimeout = setTimeout(() => {
      this.movingCompleteTimeout = null;
      this.onMovingComplete(resolution.winner, resolution.payload);
    }, animTime);
  }

  private onMovingComplete(
    winner: PlayerColor | 'draw' | null,
    resolutionPayload?: AbilityResolutionPayload,
  ): void {
    if (this.phase !== 'moving') return;
    if (!this.hasBothPlayers()) return;

    if (this.isRewardEligible()) {
      void recordMatchPlayed({
        userIds: [...this.players.values()].map((player) => player.userId),
        matchType: 'ability',
      });
    }

    if (winner) {
      this.phase = 'gameover';
      if (winner !== 'draw' && !this.rewardsGranted && this.isRewardEligible()) {
        const loserColor: PlayerColor = winner === 'red' ? 'blue' : 'red';
        const winnerUserId = this.players.get(winner)?.userId ?? null;
        const loserUserId = this.players.get(loserColor)?.userId ?? null;
        const loserLossAlreadyRecorded =
          this.players.get(loserColor)?.disconnectLossRecorded === true;
        this.players.get(winner)!.stats.wins += 1;
        if (!loserLossAlreadyRecorded) {
          this.players.get(loserColor)!.stats.losses += 1;
        }
        if (winnerUserId && loserUserId && !loserLossAlreadyRecorded) {
          void recordMatchmakingResult(winnerUserId, loserUserId);
        } else {
          if (winnerUserId) {
            void recordMatchmakingWin(winnerUserId);
          }
          if (loserUserId && !loserLossAlreadyRecorded) {
            void recordMatchmakingLoss(loserUserId);
          }
        }
        void recordModeWin({ userId: winnerUserId, mode: 'ability' });
        void recordAbilitySpecialWin({
          winnerUserId,
          winnerHp: this.players.get(winner)?.hp ?? 0,
          disconnectWin: false,
        });
        void recordAbilitySkillFinish({
          winnerUserId,
          finisherSkillId: resolutionPayload
            ? findFinisherSkillId(loserColor, resolutionPayload.skillEvents)
            : null,
        });
        this.rewardsGranted = true;
      }
      this.touchActivity();
      this.io.to(this.roomId).emit('ability_game_over', { winner });
      return;
    }

    for (const player of this.players.values()) {
      player.invulnerableSteps = 0;
    }
    this.turn += 1;
    this.attackerColor = this.attackerColor === 'red' ? 'blue' : 'red';
    this.updateRoles();
    this.touchActivity();
    this.clearNextRoundTimeout();
    this.nextRoundTimeout = setTimeout(() => {
      this.nextRoundTimeout = null;
      this.startRound();
    }, 500);
  }

  private validatePlan(player: AbilityPlayerState, path: Position[], skills: AbilitySkillReservation[]): { path: Position[]; skills: AbilitySkillReservation[] } | null {
    const pathPoints = this.currentPathPoints();
    const uniqueSkills = normalizeSkillReservations(skills);
    const isOverdriveTurn = player.overdriveActive;

    const manaCost = uniqueSkills.reduce(
      (sum, skill) => sum + ABILITY_SKILL_COSTS[skill.skillId],
      0,
    );
    if (manaCost > player.mana) return null;

    if (!validateSkillRoleRestrictions(player, uniqueSkills)) return null;
    if (!validateCommonSkillReservations(player, uniqueSkills, path, isOverdriveTurn)) {
      return null;
    }

    const hasGuard = uniqueSkills.some((skill) => skill.skillId === 'classic_guard');
    const hasAtField = uniqueSkills.some((skill) => skill.skillId === 'arc_reactor_field');
    const hasPhaseShift = uniqueSkills.some((skill) => skill.skillId === 'phase_shift');
    const hasOverdrive = uniqueSkills.some((skill) => skill.skillId === 'gold_overdrive');
    const teleport = uniqueSkills.find((skill) => skill.skillId === 'quantum_shift') ?? null;
    const hasBlitz = uniqueSkills.some((skill) => skill.skillId === 'electric_blitz');
    const hasAttackSkill = uniqueSkills.some(
      (skill) =>
        skill.skillId === 'ember_blast' ||
        skill.skillId === 'atomic_fission' ||
        skill.skillId === 'inferno_field' ||
        skill.skillId === 'nova_blast' ||
        skill.skillId === 'sun_chariot' ||
        skill.skillId === 'electric_blitz' ||
        skill.skillId === 'cosmic_bigbang' ||
        skill.skillId === 'wizard_magic_mine',
    );
    const hasBigBang = uniqueSkills.some((skill) => skill.skillId === 'cosmic_bigbang');
    const bigBang = uniqueSkills.find((skill) => skill.skillId === 'cosmic_bigbang') ?? null;
    const hasCharge = uniqueSkills.some((skill) => skill.skillId === 'plasma_charge');
    const hasAtomic = uniqueSkills.some((skill) => skill.skillId === 'atomic_fission');
    const movementSkills = uniqueSkills
      .filter((skill) => skill.skillId === 'quantum_shift' || skill.skillId === 'electric_blitz')
      .sort((left, right) => {
        if (left.step !== right.step) return left.step - right.step;
        return left.order - right.order;
      });

    if (player.reboundLocked && path.length > 0) return null;

    if (!isOverdriveTurn && !hasBlitz) {
      const validationObstacles = hasPhaseShift ? [] : this.obstacles;

      if (teleport) {
        if (!teleport.target) return null;
        if (teleport.step < 0 || teleport.step > path.length) return null;
        const teleportOrigin =
          teleport.step === 0 ? player.position : path[teleport.step - 1];
        if (!teleportOrigin) return null;
        const rowDelta = Math.abs(teleport.target.row - teleportOrigin.row);
        const colDelta = Math.abs(teleport.target.col - teleportOrigin.col);
        if (rowDelta > 1 || colDelta > 1 || (rowDelta === 0 && colDelta === 0)) return null;
        if (validationObstacles.some((obstacle) => obstacle.row === teleport.target!.row && obstacle.col === teleport.target!.col)) return null;
        if (teleport.target.row < 0 || teleport.target.row > 4 || teleport.target.col < 0 || teleport.target.col > 4) return null;
      }

      if (teleport) {
        const prefixPath = path.slice(0, teleport.step);
        const suffixPath = path.slice(teleport.step);
        if (!isValidPath(player.position, prefixPath, hasGuard ? 0 : pathPoints, validationObstacles)) return null;
        if (!isValidPath(teleport.target!, suffixPath, hasGuard ? 0 : pathPoints, validationObstacles)) return null;
      } else if (!isValidPath(player.position, path, hasGuard ? 0 : hasCharge ? 1 : pathPoints, validationObstacles)) {
        return null;
      }

      for (const skill of uniqueSkills) {
        if (skill.skillId === 'inferno_field') {
          if (!skill.target) return null;
          if (
            skill.target.row < 0 ||
            skill.target.row > 4 ||
            skill.target.col < 0 ||
            skill.target.col > 4
          ) return null;
          const infernoOrigin =
            skill.step === 0 ? player.position : path[skill.step - 1];
          if (infernoOrigin && posEqual(infernoOrigin, skill.target)) return null;
        }
      }

      if (hasOverdrive) {
        const overdriveSkill = uniqueSkills.find((skill) => skill.skillId === 'gold_overdrive');
        if (!overdriveSkill || overdriveSkill.step > path.length) return null;
      }

      return {
        path: [...path],
        skills: uniqueSkills,
      };
    }

    let cursor = 0;
    let segmentStart = player.position;
    for (const skill of uniqueSkills) {
      if (skill.skillId === 'inferno_field') {
        if (!skill.target) return null;
        if (
          skill.target.row < 0 ||
          skill.target.row > 4 ||
          skill.target.col < 0 ||
          skill.target.col > 4
        ) return null;
        const infernoOrigin =
          skill.step === 0 ? player.position : path[skill.step - 1];
        if (infernoOrigin && posEqual(infernoOrigin, skill.target)) return null;
      }
    }

    for (const movementSkill of movementSkills) {
      if (movementSkill.step < cursor) return null;
      const prefixSegment = path.slice(cursor, movementSkill.step);
      const validationObstacles = hasPhaseShift ? [] : this.obstacles;
      if (!isValidPath(segmentStart, prefixSegment, pathPoints, validationObstacles)) {
        return null;
      }
      const movementOrigin =
        prefixSegment.length > 0
          ? prefixSegment[prefixSegment.length - 1]
          : segmentStart;

      if (movementSkill.skillId === 'quantum_shift') {
        const target = movementSkill.target!;
        const rowDelta = Math.abs(target.row - movementOrigin.row);
        const colDelta = Math.abs(target.col - movementOrigin.col);
        if (rowDelta > 1 || colDelta > 1 || (rowDelta === 0 && colDelta === 0)) return null;
        if (target.row < 0 || target.row > 4 || target.col < 0 || target.col > 4) return null;
        if (validationObstacles.some((obstacle) => obstacle.row === target.row && obstacle.col === target.col)) {
          return null;
        }
        segmentStart = target;
        cursor = movementSkill.step;
        continue;
      }

      const target = movementSkill.target!;
      const blitzPath = buildBlitzPath(movementOrigin, target);
      if (blitzPath.length === 0) return null;
      const authoredBlitzPath = path.slice(movementSkill.step, movementSkill.step + blitzPath.length);
      if (authoredBlitzPath.length !== blitzPath.length) return null;
      for (let index = 0; index < blitzPath.length; index++) {
        if (!posEqual(blitzPath[index], authoredBlitzPath[index])) return null;
      }
      segmentStart = blitzPath[blitzPath.length - 1];
      cursor = movementSkill.step + blitzPath.length;
    }

    const suffix = path.slice(cursor);
    const validationObstacles = hasPhaseShift ? [] : this.obstacles;
    if (!isValidPath(segmentStart, suffix, pathPoints, validationObstacles)) {
      return null;
    }

    return {
      path: [...path],
      skills: uniqueSkills,
    };
  }

  private getPlayerBySocket(socketId: string): AbilityPlayerState | undefined {
    return [...this.players.values()].find((player) => player.socketId === socketId);
  }

  private emitToOpponent(socketId: string, event: string, data: unknown): void {
    for (const player of this.players.values()) {
      if (player.socketId !== socketId) {
        this.io.to(player.socketId).emit(event, data);
        return;
      }
    }
  }

  private toClientPlayer(player: AbilityPlayerState) {
    const base = toClientPlayer(player);
    return {
      ...base,
      mana: player.mana,
      invulnerableSteps: player.invulnerableSteps,
      overdriveActive: player.overdriveActive,
      reboundLocked: player.reboundLocked,
      hidden: player.hidden,
      previousTurnStart: player.previousTurnStart,
      previousTurnPath: player.previousTurnPath,
      equippedSkills: player.equippedSkills,
      timeRewindUsed: player.timeRewindUsed,
    };
  }

  private currentPathPoints(): number {
    if (this.trainingMode) {
      return TRAINING_PATH_POINTS;
    }
    const hasDisconnectedHuman = [...this.players.values()].some(
      (player) => player.connected === false && !player.isBot,
    );
    return hasDisconnectedHuman ? 30 : calcPathPoints(this.turn);
  }

  private planBotTurn(
    bot: AbilityPlayerState,
    opponent: AbilityPlayerState,
  ): void {
    if (this.trainingMode) {
      bot.pathSubmitted = true;
      bot.plannedPath = [];
      bot.plannedSkills = [];
      return;
    }

    const pathPoints = this.currentPathPoints();
    const candidate = this.chooseBotAction(bot, opponent, pathPoints);
    const validated = this.validatePlan(bot, candidate.path, candidate.skills) ?? {
      path: [],
      skills: [],
    };

    bot.plannedPath = validated.path;
    bot.plannedSkills = validated.skills;
    bot.pathSubmitted = true;

    // 4코 스킬 연속 사용 방지를 위해 사용 턴 기록
    const usedSkillId = validated.skills[0]?.skillId ?? null;
    if (usedSkillId && ABILITY_SKILL_COSTS[usedSkillId] === 4) {
      this.botLastFourCostSkillTurn.set(bot.color, this.turn);
    }

    if (ABILITY_FAKE_AI_DEBUG_LOG) {
      console.debug('[ability-fake-ai]', {
        bot: bot.nickname,
        role: bot.role,
        equippedSkills: bot.equippedSkills,
        mana: bot.mana,
        selectedSkill:
          validated.skills[0]?.skillId ?? candidate.selectedSkill ?? null,
        reason: candidate.reason,
        path: validated.path,
        skills: validated.skills,
      });
    }
  }

  private chooseBotAction(
    bot: AbilityPlayerState,
    opponent: AbilityPlayerState,
    pathPoints: number,
  ): BotActionCandidate {
    // 용암 타일을 장애물로 추가해 경로 계산 시 용암을 피하도록 한다.
    const lavaObstacles = this.lavaTiles.map((t) => t.position);
    const effectiveObstacles = [...this.obstacles, ...lavaObstacles];

    // ── 무력화 적 섬멸 패턴 최우선 처리 ──────────────────────────────────
    // 상대가 오버드라이브 부작용으로 이동 불가 상태일 때 강제 진입.
    // forced blitz 등 다른 모든 패턴보다 먼저 체크해야 한다.
    if (bot.role === 'attacker' && opponent.reboundLocked && opponent.equippedSkills.includes('gold_overdrive')) {
      const annihilationCandidates = this.buildAnnihilationCandidates(
        bot,
        opponent,
        pathPoints,
        effectiveObstacles,
      );
      if (annihilationCandidates.length > 0) {
        annihilationCandidates.sort((a, b) => b.score - a.score);
        return annihilationCandidates[0]!;
      }
    }

    // ── 벽력일섬 강제 발사 패턴 ──────────────────────────────────────────
    const forcedBlitzCandidate = this.buildForcedBlitzCandidate(bot, opponent);
    if (forcedBlitzCandidate) {
      return forcedBlitzCandidate;
    }

    // 도망자이고 상대와 겹쳐진 상태일 때:
    // 점수 계산이 '가만히 있기'를 과대평가하므로 50% 확률로 강제 이동 패턴 적용
    if (bot.role !== 'attacker' && posEqual(bot.position, opponent.position) && Math.random() < 0.5) {
      const neighbors = getCardinalNeighbors(bot.position, effectiveObstacles);
      if (neighbors.length > 0) {
        const target = neighbors[Math.floor(Math.random() * neighbors.length)]!;
        const validated = this.validatePlan(bot, [target], []);
        if (validated) {
          return {
            path: validated.path,
            skills: [],
            score: 0,
            reason: 'overlap-escape-forced-move',
            selectedSkill: null,
          };
        }
      }
    }

    const selfModel = buildBotPathModel({
      start: bot.position,
      opponent: opponent.position,
      role: bot.role === 'attacker' ? 'attacker' : 'escaper',
      pathPoints,
      obstacles: effectiveObstacles,
    });
    const opponentModel = buildBotPathModel({
      start: opponent.position,
      opponent: bot.position,
      role: bot.role === 'attacker' ? 'escaper' : 'attacker',
      pathPoints,
      obstacles: effectiveObstacles,
    });

    const candidates: BotActionCandidate[] = selfModel.paths
      .slice(0, 5)
      .map((path, index) => ({
        path,
        skills: [],
        score:
          bot.role === 'attacker'
            ? scoreAttackPathAgainstModel(
                bot.position,
                path,
                opponent.position,
                opponentModel,
                effectiveObstacles,
              )
            : scoreEscapePathAgainstModel(
                bot.position,
                path,
                opponent.position,
                opponentModel,
                effectiveObstacles,
              ),
        reason: index === 0 ? 'base-primary' : 'base-alt',
        selectedSkill: null,
      }));

    // ── 매직마인 마나 절약 (스코어 유도) ────────────────────────────────
    // 빅뱅 없이 매직마인만 있을 때 소폭 절약 보너스 부여
    if (
      bot.role === 'attacker' &&
      bot.equippedSkills.includes('wizard_magic_mine') &&
      !bot.equippedSkills.includes('cosmic_bigbang') &&
      bot.mana < 8
    ) {
      const turnsNeeded = Math.ceil((8 - bot.mana) / 2);
      if (turnsNeeded <= 2) {
        const saveBonus = Math.round((350 / turnsNeeded) * 0.45);
        for (const candidate of candidates) {
          if (candidate.skills.length === 0) {
            candidate.score += saveBonus;
          }
        }
      }
    }

    const activeSkillCandidates = this.buildBotSkillActionCandidates(
      bot,
      opponent,
      pathPoints,
      selfModel,
      opponentModel,
      effectiveObstacles,
    );
    candidates.push(...activeSkillCandidates);

    candidates.sort((left, right) => right.score - left.score);
    return candidates[0] ?? {
      path: [],
      skills: [],
      score: 0,
      reason: 'fallback-empty',
      selectedSkill: null,
    };
  }

  // 상대방과 일직선(같은 행/열)이 되는 위치까지 이동한 뒤 벽력일섬을 발사하는 후보를 생성한다.
  // minPrefixSteps: 발사 전 최소 이동 칸 수 (가드=3, AT필드=1)
  // 무력화 적 섬멸 패턴:
  // 상대가 gold_overdrive의 부작용으로 reboundLocked(흑백 + 이동 불가) 상태일 때,
  // 공격자가 상대 위치를 여러 번 경유하는 경로를 생성하고,
  // 적에게 명중하는 타이밍에 공격 스킬을 사용해 해당 턴 최대 피해를 입힌다.
  //
  // 경로 우선순위:
  //   1) 사각형 패턴 (2×2, 4스텝 루프)
  //   2) BFS로 찾은 최단 복귀 사이클 (장애물로 사각형 불가 시)
  //   3) 단일 접근 (사이클 자체가 불가능한 경우 최소 1회 충돌 보장)
  private buildAnnihilationCandidates(
    bot: AbilityPlayerState,
    opponent: AbilityPlayerState,
    pathPoints: number,
    effectiveObstacles: Position[],
  ): BotActionCandidate[] {
    if (bot.role !== 'attacker') return [];
    if (!opponent.reboundLocked) return [];
    if (!opponent.equippedSkills.includes('gold_overdrive')) return [];

    const targetPos = opponent.position;

    // 상대 위치까지 최단 접근 경로 (마지막 셀 = targetPos)
    const approachPath = buildShortestAbilityPath(bot.position, targetPos, effectiveObstacles);
    if (approachPath.length === 0) return [];

    // loopStart: 접근 경로에서 targetPos 바로 이전 셀
    const loopStart = approachPath.length >= 2
      ? approachPath[approachPath.length - 2]!
      : bot.position;

    // ── 1단계: 사각형 코너 탐색 ─────────────────────────────────────────
    const dr = targetPos.row - loopStart.row;
    const dc = targetPos.col - loopStart.col;
    let corner1: Position | null = null;
    let corner2: Position | null = null;

    if (dr === 0) {
      for (const perpDr of [-1, 1]) {
        const c1 = { row: targetPos.row + perpDr, col: targetPos.col };
        const c2 = { row: loopStart.row + perpDr, col: loopStart.col };
        if (
          inBoard(c1) && !isObstacle(c1, effectiveObstacles) &&
          inBoard(c2) && !isObstacle(c2, effectiveObstacles)
        ) { corner1 = c1; corner2 = c2; break; }
      }
    } else {
      for (const perpDc of [-1, 1]) {
        const c1 = { row: targetPos.row, col: targetPos.col + perpDc };
        const c2 = { row: loopStart.row, col: loopStart.col + perpDc };
        if (
          inBoard(c1) && !isObstacle(c1, effectiveObstacles) &&
          inBoard(c2) && !isObstacle(c2, effectiveObstacles)
        ) { corner1 = c1; corner2 = c2; break; }
      }
    }

    // ── 2단계: 루프 세그먼트 결정 ────────────────────────────────────────
    let loopSegment: Position[] | null = null;

    if (corner1 && corner2) {
      // 사각형 패턴: [corner1, corner2, loopStart, targetPos]
      loopSegment = [corner1, corner2, loopStart, targetPos];
    } else {
      // BFS로 최단 복귀 사이클 탐색 (역행 없이 targetPos→...→targetPos)
      const maxCycleLen = pathPoints - approachPath.length;
      if (maxCycleLen >= 2) {
        loopSegment = findShortestReturnCycle(targetPos, loopStart, effectiveObstacles, maxCycleLen);
      }
    }

    // ── 3단계: 최종 경로 조합 ─────────────────────────────────────────────
    // 루프가 있으면 반복 삽입, 없으면 단순 접근 경로만 사용 (1회 충돌 보장)
    const hitPath: Position[] = [...approachPath];
    if (loopSegment) {
      while (hitPath.length + loopSegment.length <= pathPoints) {
        hitPath.push(...loopSegment);
      }
    }
    hitPath.splice(pathPoints);

    const BASE_SCORE = 999990;
    const SKILL_BONUS = 8;
    const candidates: BotActionCandidate[] = [];

    // 기본 경로 후보 (스킬 없음)
    const baseValidated = this.validatePlan(bot, hitPath, []);
    if (baseValidated) {
      candidates.push({
        path: baseValidated.path,
        skills: [],
        score: BASE_SCORE,
        reason: loopSegment ? 'annihilation-loop-base' : 'annihilation-single-hit-base',
        selectedSkill: null,
      });
    }

    // 경로에서 targetPos에 도달하는 step 목록 수집
    const targetSteps: number[] = [];
    for (let s = 0; s <= hitPath.length; s++) {
      if (posEqual(getSequencePosition(bot.position, hitPath, s), targetPos)) {
        targetSteps.push(s);
      }
    }

    // 공격 스킬별 후보: 적을 명중할 수 있는 타이밍에 사용
    for (const skillId of bot.equippedSkills) {
      if (!ABILITY_FAKE_AI_SKILL_POOL.includes(skillId)) continue;
      if (bot.mana < ABILITY_SKILL_COSTS[skillId]) continue;
      const serverRule = ABILITY_SKILL_SERVER_RULES[skillId];
      if (serverRule.roleRestriction === 'escaper') continue;
      if (
        skillId === 'chronos_time_rewind' ||
        skillId === 'classic_guard' ||
        skillId === 'arc_reactor_field' ||
        skillId === 'aurora_heal' ||
        skillId === 'quantum_shift' ||
        skillId === 'gold_overdrive' ||
        skillId === 'sun_chariot' ||
        skillId === 'atomic_fission' ||
        skillId === 'inferno_field'
      ) continue;

      if (skillId === 'cosmic_bigbang') {
        const validated = this.validatePlan(bot, [], [{ skillId, step: 0, order: 0 }]);
        if (validated) {
          candidates.push({
            path: [],
            skills: validated.skills,
            score: BASE_SCORE + SKILL_BONUS,
            reason: 'annihilation-bigbang',
            selectedSkill: skillId,
          });
        }
        continue;
      }

      if (skillId === 'electric_blitz') {
        // 경로 후반부, loopStart 또는 targetPos와 같은 행/열 위치에서 마지막 발사
        let lastBlitzStep = -1;
        let lastBlitzDir: Position | null = null;
        for (let s = 0; s <= hitPath.length; s++) {
          const pos = getSequencePosition(bot.position, hitPath, s);
          const dir = getBlitzDirectionTowardOpponent(pos, targetPos);
          if (dir) { lastBlitzStep = s; lastBlitzDir = dir; }
        }
        if (lastBlitzStep < 0 || !lastBlitzDir) continue;

        const blitzOrigin = getSequencePosition(bot.position, hitPath, lastBlitzStep);
        const blitzSuffix = buildBlitzPath(blitzOrigin, lastBlitzDir);
        if (blitzSuffix.length === 0) continue;

        const prefix = hitPath.slice(0, lastBlitzStep);
        const fullPath = [...prefix, ...blitzSuffix];
        const validated = this.validatePlan(bot, fullPath, [
          { skillId, step: lastBlitzStep, order: 0, target: lastBlitzDir },
        ]);
        if (validated) {
          candidates.push({
            path: validated.path,
            skills: validated.skills,
            score: BASE_SCORE + SKILL_BONUS,
            reason: 'annihilation-electric-blitz-end',
            selectedSkill: skillId,
          });
        }
        continue;
      }

      // 경로 내 적을 명중할 수 있는 첫 타이밍을 찾아 스킬 사용
      let skillReservation: AbilitySkillReservation | null = null;

      if (skillId === 'ember_blast') {
        // 십자 범위(자신 + 상하좌우)에 targetPos가 포함되는 첫 step
        for (let s = 0; s <= hitPath.length; s++) {
          const pos = getSequencePosition(bot.position, hitPath, s);
          if (getCrossPositions(pos).some((p) => posEqual(p, targetPos))) {
            skillReservation = { skillId, step: s, order: 0 };
            break;
          }
        }
      } else if (skillId === 'nova_blast') {
        // X자 대각 범위에 targetPos가 포함되는 첫 step
        for (let s = 0; s <= hitPath.length; s++) {
          const pos = getSequencePosition(bot.position, hitPath, s);
          if (getNovaPositions(pos).some((p) => posEqual(p, targetPos))) {
            skillReservation = { skillId, step: s, order: 0 };
            break;
          }
        }
      } else if (skillId === 'wizard_magic_mine') {
        // 첫 번째 targetPos 도달 시점에 함정 설치 → 즉시 피해
        const firstTargetStep = targetSteps[0] ?? -1;
        if (firstTargetStep >= 0) {
          skillReservation = { skillId, step: firstTargetStep, order: 0 };
        }
      }

      if (!skillReservation) continue;
      const validated = this.validatePlan(bot, hitPath, [skillReservation]);
      if (validated) {
        candidates.push({
          path: validated.path,
          skills: validated.skills,
          score: BASE_SCORE + SKILL_BONUS,
          reason: `annihilation-${skillId}`,
          selectedSkill: skillId,
        });
      }
    }

    return candidates;
  }

  private buildDelayedBlitzCandidate(
    bot: AbilityPlayerState,
    opponent: AbilityPlayerState,
    minPrefixSteps: number,
  ): BotActionCandidate | null {
    const pathPoints = this.currentPathPoints();
    const effectiveObstacles = [
      ...this.obstacles,
      ...this.lavaTiles.map((t) => t.position),
    ];

    const validCandidates: BotActionCandidate[] = [];

    for (const launchPos of listBoardPositions()) {
      if (posEqual(launchPos, bot.position)) continue;
      if (isObstacle(launchPos, effectiveObstacles)) continue;
      // 상대와 같은 행 또는 열이어야 한다
      if (launchPos.row !== opponent.position.row && launchPos.col !== opponent.position.col) continue;

      // 발사 위치에서 상대 방향의 blitz 방향 구하기
      const blitzDir = getBlitzDirectionTowardOpponent(launchPos, opponent.position);
      if (!blitzDir) continue;

      const blitzPath = buildBlitzPath(launchPos, blitzDir);
      if (blitzPath.length === 0) continue;

      // 현재 위치에서 launchPos까지 최단 경로 (장애물 회피)
      const prefixPath = buildShortestAbilityPath(bot.position, launchPos, effectiveObstacles);
      if (prefixPath.length < minPrefixSteps) continue;
      if (prefixPath.length + blitzPath.length > pathPoints) continue;

      const fullPath = [...prefixPath, ...blitzPath];
      const skillStep = prefixPath.length;

      const validated = this.validatePlan(
        bot,
        fullPath,
        [{ skillId: 'electric_blitz', step: skillStep, order: 0, target: blitzDir }],
      );
      if (!validated) continue;

      validCandidates.push({
        path: validated.path,
        skills: validated.skills,
        score: 999998,
        reason: 'delayed-electric-blitz',
        selectedSkill: 'electric_blitz',
      });
    }

    if (validCandidates.length === 0) return null;
    return validCandidates[Math.floor(Math.random() * validCandidates.length)] ?? null;
  }

  private buildForcedBlitzCandidate(
    bot: AbilityPlayerState,
    opponent: AbilityPlayerState,
  ): BotActionCandidate | null {
    if (bot.role !== 'attacker') return null;
    if (!bot.equippedSkills.includes('electric_blitz')) return null;
    if (bot.mana < ABILITY_SKILL_COSTS.electric_blitz) return null;
    // 무력화 적 섬멸 패턴이 활성화되는 조건이면 즉시 발사 금지
    // → annihilation 패턴이 경로 마지막 부근에서 벽력일섬을 사용하도록 위임
    if (opponent.reboundLocked && opponent.equippedSkills.includes('gold_overdrive')) return null;

    // 상대가 가드 또는 AT필드 장착 시 50% 확률로 지연 발사 패턴 시도
    const opponentHasGuard = opponent.equippedSkills.includes('classic_guard');
    const opponentHasAtField = opponent.equippedSkills.includes('arc_reactor_field');
    if ((opponentHasGuard || opponentHasAtField) && Math.random() < 0.5) {
      // 가드: 3칸 이상 이동 후 발사, AT필드: 1칸 이상 이동 후 발사
      const minPrefixSteps = opponentHasGuard ? 3 : 1;
      const delayed = this.buildDelayedBlitzCandidate(bot, opponent, minPrefixSteps);
      if (delayed) return delayed;
    }

    const directionTarget = getBlitzDirectionTowardOpponent(
      bot.position,
      opponent.position,
    );
    if (!directionTarget) return null;

    const blitzPath = buildBlitzPath(bot.position, directionTarget);
    if (blitzPath.length === 0) return null;

    const forced = this.validatePlan(
      bot,
      blitzPath,
      [{ skillId: 'electric_blitz', step: 0, order: 0, target: directionTarget }],
    );

    if (!forced) {
      return null;
    }

    return {
      path: forced.path,
      skills: forced.skills,
      score: 999999,
      reason: 'forced-electric-blitz-straight-line',
      selectedSkill: 'electric_blitz',
    };
  }

  private buildBotSkillActionCandidates(
    bot: AbilityPlayerState,
    opponent: AbilityPlayerState,
    pathPoints: number,
    selfModel: BotPathModel,
    opponentModel: BotPathModel,
    effectiveObstacles: Position[],
  ): BotActionCandidate[] {
    // ── 빅뱅폭발 마나 모으기 하드 규칙 ──────────────────────────────────
    // 빅뱅 장착 시 상대 HP에 따라 마나 적립 패턴 진입 여부를 결정:
    //   HP ≤ 2: 항상 적립 (확정 킬각)
    //   HP ≤ 5: 50% 확률로 적립 (킬각 준비)
    //   HP > 5: 적립 안 함, 일반 스킬 허용 (빅뱅 후보는 마나 부족으로 어차피 스킵)
    //   마나 = 10 + 에스케이퍼: 마나 낭비 방지를 위해 스킬 후보 차단
    //   마나 = 10 + 공격자: 정상 진행 → 빅뱅 후보가 압도적 스코어로 승리
    if (bot.equippedSkills.includes('cosmic_bigbang')) {
      if (bot.mana < MAX_MANA) {
        if (opponent.hp <= 2) return [];
        if (opponent.hp <= 5 && Math.random() < 0.5) return [];
      }
      if (bot.role !== 'attacker') return [];
    }

    // ── 오로라힐 마나 모으기 하드 규칙 ──────────────────────────────────
    // aurora_heal은 HP를 최대 5(플레이어 최대 HP)까지 1 회복
    // 자신 HP에 따라 마나 적립 패턴 진입 여부를 결정:
    //   HP = 1: 항상 적립 (생존 최우선)
    //   HP = 2: 80% 확률로 적립
    //   HP = 3: 55% 확률로 적립
    //   HP = 4: 25% 확률로 적립
    //   HP = 5: 적립 안 함 (이미 만피)
    if (
      bot.equippedSkills.includes('aurora_heal') &&
      !bot.equippedSkills.includes('cosmic_bigbang') &&
      bot.mana < ABILITY_SKILL_COSTS.aurora_heal &&
      bot.hp < ABILITY_STARTING_HP
    ) {
      if (bot.hp <= 1) return [];
      if (bot.hp === 2 && Math.random() < 0.8) return [];
      if (bot.hp === 3 && Math.random() < 0.55) return [];
      if (bot.hp === 4 && Math.random() < 0.25) return [];
    }

    const candidates: BotActionCandidate[] = [];
    const basePaths = selfModel.paths.slice(0, 5);

    // 4코 스킬 최근 4턴 이내 사용 여부 체크 (쿨다운 4턴)
    const lastFourCostTurn = this.botLastFourCostSkillTurn.get(bot.color) ?? -99;
    const usedFourCostLastTurn = this.turn - lastFourCostTurn <= 4;

    // 양자도약 예외: 상대가 벽력일섬 보유 + 같은 행/열이면 연속 사용 허용
    const opponentHasBlitz = opponent.equippedSkills.includes('electric_blitz');
    const botInBlitzLine =
      bot.position.row === opponent.position.row ||
      bot.position.col === opponent.position.col;

    // 양자도약 스킬 위협 탐지용 사전 계산
    const opponentHasNova = opponent.equippedSkills.includes('nova_blast');
    const opponentHasEmber = opponent.equippedSkills.includes('ember_blast');
    const qRowDelta = Math.abs(bot.position.row - opponent.position.row);
    const qColDelta = Math.abs(bot.position.col - opponent.position.col);
    // 엠버폭발: 십자형(맨해튼 거리 1 이하) 범위
    const botInEmberRange = opponentHasEmber && (qRowDelta + qColDelta <= 1);
    // 노바폭발: 대각선 거리 1~2 범위 (rowDelta === colDelta, 최대 2)
    const botInNovaRange = opponentHasNova && (qRowDelta === qColDelta && qRowDelta <= 2);
    // 벽력일섬 위협: 상대가 보유 + 같은 행/열
    const blitzSkillThreat = opponentHasBlitz && botInBlitzLine;
    // 특정 스킬 위협 종합 (양자도약으로 즉시 회피할 이유가 있는 상황)
    const isUnderSkillThreat = blitzSkillThreat || botInEmberRange || botInNovaRange;

    for (const skillId of bot.equippedSkills) {
      if (!ABILITY_FAKE_AI_SKILL_POOL.includes(skillId)) continue;
      if (bot.mana < ABILITY_SKILL_COSTS[skillId]) continue;
      const serverRule = ABILITY_SKILL_SERVER_RULES[skillId];
      if (
        (serverRule.roleRestriction === 'attacker' && bot.role !== 'attacker') ||
        (serverRule.roleRestriction === 'escaper' && bot.role !== 'escaper')
      ) {
        continue;
      }
      if (skillId === 'chronos_time_rewind') continue;

      if (skillId === 'aurora_heal') {
        // aurora_heal은 HP를 1 회복 (최대 5) → 만피면 사용 불필요
        if (bot.hp >= ABILITY_STARTING_HP) continue;
        // HP가 낮을수록 높은 보너스 점수 (생존 가치)
        const healBonus = bot.hp <= 1 ? 700 : bot.hp === 2 ? 450 : bot.hp === 3 ? 250 : 100;
        for (const path of basePaths) {
          const base = this.scoreBotActionCandidate(
            bot,
            opponent,
            path,
            [{ skillId: 'aurora_heal', step: 0, order: 0 }],
            opponentModel,
            'aurora-heal',
            effectiveObstacles,
          );
          candidates.push({ ...base, score: base.score + healBonus });
        }
        continue;
      }

      if (skillId === 'classic_guard') {
        // 사용 조건(AT필드와 동일):
        //  1) 상대가 벽력일섬을 보유하고 일직선(같은 행/열)에 있을 때
        //  2) 봇과 상대 거리가 2 이하일 때
        const guardDist =
          Math.abs(bot.position.row - opponent.position.row) +
          Math.abs(bot.position.col - opponent.position.col);
        const guardInBlitzLineThreat =
          opponent.equippedSkills.includes('electric_blitz') &&
          (bot.position.row === opponent.position.row ||
            bot.position.col === opponent.position.col);
        const guardCloseRange = guardDist <= 2;
        if (!guardInBlitzLineThreat && !guardCloseRange) continue;

        const danger = scoreEscapePathAgainstModel(
          bot.position,
          [],
          opponent.position,
          opponentModel,
          this.obstacles,
        );
        candidates.push({
          path: [],
          skills: [{ skillId, step: 0, order: 0 }],
          score: danger + (guardInBlitzLineThreat ? 200 : 140),
          reason: 'guard-life-saving',
          selectedSkill: skillId,
        });
        continue;
      }

      if (skillId === 'arc_reactor_field') {
        // 사용 조건:
        //  1) 상대가 벽력일섬을 보유하고 일직선(같은 행/열)에 있을 때
        //  2) 봇과 상대 거리가 2 이하일 때
        const dist =
          Math.abs(bot.position.row - opponent.position.row) +
          Math.abs(bot.position.col - opponent.position.col);
        const inBlitzLineThreat =
          opponent.equippedSkills.includes('electric_blitz') &&
          (bot.position.row === opponent.position.row ||
            bot.position.col === opponent.position.col);
        const closeRange = dist <= 2;
        if (!inBlitzLineThreat && !closeRange) continue;

        const basePath = basePaths[0] ?? [];
        candidates.push({
          path: basePath,
          skills: [{ skillId, step: 0, order: 0 }],
          score:
            scoreEscapePathAgainstModel(
              bot.position,
              basePath,
              opponent.position,
              opponentModel,
              this.obstacles,
            ) + (inBlitzLineThreat ? 200 : 110),
          reason: 'at-field-threat-check',
          selectedSkill: skillId,
        });
        continue;
      }

      if (skillId === 'quantum_shift') {
        // 도망 역할일 때만 위기 탈출 목적으로 사용 (공격 역할에서는 사용 금지)
        if (bot.role !== 'escaper') continue;

        // 연속 사용 제한: 직전 턴에 4코 스킬 사용 시 건너뜀
        // 예외: 특정 스킬 위협(벽력일섬/노바폭발/엠버폭발)이 있으면 회피 목적으로 허용
        if (usedFourCostLastTurn) {
          if (!isUnderSkillThreat) continue;
        }

        // 고비용 공격/방어 스킬이 함께 장착된 경우 마나낭비 패널티 부여
        const quantumHighCostMax = bot.equippedSkills
          .filter((s) => {
            if (s === skillId) return false;
            if (s === 'chronos_time_rewind') return false;
            return ABILITY_SKILL_COSTS[s] > ABILITY_SKILL_COSTS[skillId];
          })
          .reduce((max, s) => Math.max(max, ABILITY_SKILL_COSTS[s]), 0);
        // 6코→270, 8코→360, 10코→450
        const quantumManaWastePenalty = quantumHighCostMax > 0
          ? Math.round(quantumHighCostMax * 45)
          : 0;

        // 모든 인접 목표지에 대해 양자도약 후보 생성
        const quantumTargets = getAdjacentBlinkTargets(
          bot.position,
          effectiveObstacles,
          opponent.position,
        );
        const quantumScoredList: Array<{ target: Position; score: number; blinkPath: Position[] }> = [];
        for (const target of quantumTargets) {
          const blinkPath = createAiPath({
            color: bot.color,
            role: bot.role,
            selfPosition: target,
            opponentPosition: opponent.position,
            pathPoints,
            obstacles: effectiveObstacles,
          });
          const base = this.scoreBotActionCandidate(bot, opponent, blinkPath, [
            { skillId, step: 0, order: 0, target },
          ], opponentModel, `quantum_shift:${target.row},${target.col}`, effectiveObstacles);
          quantumScoredList.push({
            target,
            blinkPath,
            score: base.score - quantumManaWastePenalty,
          });
        }
        // 안전도 기준 내림차순 정렬 → 가장 안전한 목적지 우선
        quantumScoredList.sort((a, b) => b.score - a.score);

        // ── 위협 조건 감지 → 70% 확률로 강제 회피 ──────────────────────────
        // 기준1: 상대가 벽력일섬 보유 + 같은 행/열 일직선
        // 기준2: 상대가 노바폭발/엠버폭발 보유 + 사정거리 이내
        let quantumBonus = 0;
        if (isUnderSkillThreat && Math.random() < 0.70) {
          // 강제 회피: 일반 경로 후보를 압도할 수 있도록 높은 보너스 부여
          quantumBonus = 1800;
        } else {
          // ── 일반 위기 감지 → 확률적 탈출 ───────────────────────────────
          // 현재 위치에서 상대 경로 모델과 충돌 위험이 심각할 때 탈출 유도
          const currentPosDanger = scoreEscapePathAgainstModel(
            bot.position,
            [],
            opponent.position,
            opponentModel,
            effectiveObstacles,
          );
          if (currentPosDanger < -300 && Math.random() < 0.50) {
            quantumBonus = 900;
          } else if (currentPosDanger < -150 && Math.random() < 0.30) {
            quantumBonus = 450;
          }
        }

        for (const entry of quantumScoredList) {
          candidates.push({
            path: entry.blinkPath,
            skills: [{ skillId, step: 0, order: 0, target: entry.target }],
            score: entry.score + quantumBonus,
            reason: `quantum_shift:${entry.target.row},${entry.target.col}`,
            selectedSkill: skillId,
          });
        }
        continue;
      }

      if (skillId === 'electric_blitz') {
        const directBlitzTarget = getBlitzDirectionTowardOpponent(
          bot.position,
          opponent.position,
        );
        // 상대가 같은 행/열에 없으면 벽력일섬 사용 금지
        if (!directBlitzTarget) continue;
        for (const target of getCardinalNeighbors(bot.position, [])) {
          const blitzPath = buildBlitzPath(bot.position, target);
          if (blitzPath.length === 0) continue;
          const interceptBonus =
            bot.role === 'attacker' &&
            posEqual(target, directBlitzTarget)
              ? 320
              : 0;
          const baseCandidate = this.scoreBotActionCandidate(
            bot,
            opponent,
            blitzPath,
            [{ skillId, step: 0, order: 0, target }],
            opponentModel,
            `electric_blitz:${target.row},${target.col}`,
            effectiveObstacles,
          );
          candidates.push(
            {
              ...baseCandidate,
              score: baseCandidate.score + interceptBonus,
            },
          );
        }
        continue;
      }

      if (skillId === 'cosmic_bigbang') {
        // 빅뱅폭발은 보드 전체 2피해 → 상대 HP가 낮을수록 킬각이 확실해진다.
        // 기본 경로 스코어(500~3000)를 이길 수 있도록 충분히 높은 값을 부여한다.
        let pressure: number;
        if (opponent.hp <= 2) {
          // 확정 킬 또는 거의 킬 → 최우선
          pressure = 4000;
        } else if (opponent.hp === 3) {
          // 상대를 HP 1로 만듦 → 매우 강력
          pressure = 1500;
        } else if (opponent.hp === 4) {
          // HP 2로 만듦 → 마나 적립 패턴에서 왔으므로 반드시 발동
          pressure = 1500;
        } else {
          // 상대 HP 5 이상 → 마나 낭비가 크므로 기본 경로가 더 나음
          pressure = -150;
        }
        // 마나 10 만충: "모았으면 반드시 쏜다" 패턴
        // 기본 경로 스코어(~2000)를 압도해 빅뱅을 항상 선택하도록 강제
        if (bot.mana >= MAX_MANA) {
          pressure += 2500;
        }
        candidates.push({
          path: [],
          skills: [{ skillId, step: 0, order: 0 }],
          score: pressure,
          reason: 'cosmic_bigbang-finish-check',
          selectedSkill: skillId,
        });
        continue;
      }

      if (skillId === 'atomic_fission') {
        if (!bot.previousTurnStart || bot.previousTurnPath.length === 0) continue;
        const shadowCoverage = this.scorePathCoverageAgainstModel(
          bot.previousTurnStart,
          bot.previousTurnPath,
          opponent.position,
          opponentModel,
          effectiveObstacles,
        );
        const path = basePaths[0] ?? [];
        candidates.push({
          path,
          skills: [{ skillId, step: 0, order: 0 }],
          score:
            this.scorePathCoverageAgainstModel(
              bot.position,
              path,
              opponent.position,
              opponentModel,
              effectiveObstacles,
            ) +
            shadowCoverage * 0.9 +
            24,
          reason: 'atomic_fission-shadow-pressure',
          selectedSkill: skillId,
        });
        continue;
      }

      if (skillId === 'sun_chariot') {
        for (const path of basePaths.slice(0, 3)) {
          const sunCoverage = this.scoreExpandedCoverageAgainstModel(
            bot.position,
            path,
            opponent.position,
            opponentModel,
            effectiveObstacles,
          );
          candidates.push({
            path,
            skills: [{ skillId, step: 0, order: 0 }],
            score: sunCoverage + 50,
            reason: 'sun_chariot-area-pressure',
            selectedSkill: skillId,
          });
        }
        continue;
      }

      if (skillId === 'wizard_magic_mine') {
        // 매직마인: 내 경로 각 step 위치에 함정 설치
        // 상대 heatmap이 높은 위치일수록 함정 가치가 크다.
        // 마나 8 고비용 → 기본 경로보다 확실히 이길 수 있도록 가중치를 높게 유지
        let bestTrapValue = 0;
        let bestPath: Position[] = basePaths[0] ?? [];
        let bestStep = 0;
        for (const path of basePaths.slice(0, 3)) {
          for (let step = 0; step <= path.length; step += 1) {
            const position = getSequencePosition(bot.position, path, step);
            const trapValue =
              (opponentModel.heatmap.get(toKey(position)) ?? 0) * 42 +
              (opponentModel.timeHeatmap.get(`${step}:${toKey(position)}`) ?? 0) *
                48;
            if (trapValue > bestTrapValue) {
              bestTrapValue = trapValue;
              bestPath = path;
              bestStep = step;
            }
            candidates.push({
              path,
              skills: [{ skillId, step, order: 0 }],
              score:
                this.scorePathCoverageAgainstModel(
                  bot.position,
                  path,
                  opponent.position,
                  opponentModel,
                  effectiveObstacles,
                ) +
                trapValue,
              reason: `magic_mine:${step}`,
              selectedSkill: skillId,
            });
          }
        }
        // 최선의 함정 위치에 추가 보너스(장기 압박 가치 반영)
        if (bestTrapValue > 0) {
          candidates.push({
            path: bestPath,
            skills: [{ skillId, step: bestStep, order: 0 }],
            score:
              this.scorePathCoverageAgainstModel(
                bot.position,
                bestPath,
                opponent.position,
                opponentModel,
                effectiveObstacles,
              ) +
              bestTrapValue +
              200,
            reason: `magic_mine:best:${bestStep}`,
            selectedSkill: skillId,
          });
        }
        continue;
      }

      if (skillId === 'inferno_field') {
        // 용암지대: 상대 핫스팟에 용암을 설치해 2턴간 통행 차단
        // 상대 heatmap 상위 셀을 타깃으로 하므로 장기 압박 가치가 높다.
        // 가중치를 충분히 높여 기본 경로보다 우선 선택되도록 한다.
        let bestLavaValue = 0;
        let bestLavaPath: Position[] = basePaths[0] ?? [];
        let bestLavaTarget: Position | null = null;
        for (const path of basePaths.slice(0, 3)) {
          for (const target of opponentModel.hotspotCells.slice(0, 5)) {
            const origin = getSequencePosition(bot.position, path, 0);
            // 시전자 현재 위치와 상대방 현재 위치에는 용암 설치 불가
            if (posEqual(origin, target)) continue;
            if (posEqual(opponent.position, target)) continue;
            // 봇 자신이 이동할 경로가 설치한 용암 위치를 경유하면 자기 피해 → 건너뜀
            if (path.some((pos) => posEqual(pos, target))) continue;
            const lavaValue =
              (opponentModel.heatmap.get(toKey(target)) ?? 0) * 40 +
              (opponentModel.timeHeatmap.get(`1:${toKey(target)}`) ?? 0) * 28;
            if (lavaValue > bestLavaValue) {
              bestLavaValue = lavaValue;
              bestLavaPath = path;
              bestLavaTarget = target;
            }
            candidates.push({
              path,
              skills: [{ skillId, step: 0, order: 0, target }],
              score:
                this.scorePathCoverageAgainstModel(
                  bot.position,
                  path,
                  opponent.position,
                  opponentModel,
                  effectiveObstacles,
                ) +
                lavaValue,
              reason: `inferno_field:${target.row},${target.col}`,
              selectedSkill: skillId,
            });
          }
        }
        // 최선의 용암 위치에 추가 보너스(경로 차단 가치 반영)
        if (bestLavaTarget && bestLavaValue > 0) {
          candidates.push({
            path: bestLavaPath,
            skills: [{ skillId, step: 0, order: 0, target: bestLavaTarget }],
            score:
              this.scorePathCoverageAgainstModel(
                bot.position,
                bestLavaPath,
                opponent.position,
                opponentModel,
                effectiveObstacles,
              ) +
              bestLavaValue +
              180,
            reason: `inferno_field:best:${bestLavaTarget.row},${bestLavaTarget.col}`,
            selectedSkill: skillId,
          });
        }
        continue;
      }

      if (skillId === 'ember_blast' || skillId === 'nova_blast') {
        // 연속 사용 제한: 직전 턴에 4코 스킬 사용 시 건너뜀
        // 예외: 상대방이 현재 AoE 범위 안에 있으면(100% 명중 가능) 허용
        if (usedFourCostLastTurn) {
          const opponentInAoeNow = basePaths.slice(0, 3).some((path) => {
            const sequence = [bot.position, ...path];
            return sequence.some((pos) => {
              const affected =
                skillId === 'ember_blast'
                  ? getCrossPositions(pos)
                  : getNovaPositions(pos);
              return affected.some((cell) => posEqual(cell, opponent.position));
            });
          });
          if (!opponentInAoeNow) continue;
        }

        // 고비용 공격 스킬(6~10코)이 함께 장착된 경우,
        // 엠버/노바를 쓰면 마나가 소진되어 해당 스킬을 사용하지 못하게 된다.
        // 장착된 다른 공격 스킬의 최대 코스트에 비례해 패널티를 부여한다.
        const otherHighCostAttackSkillMaxCost = bot.equippedSkills
          .filter((s) => {
            if (s === skillId) return false;
            if (s === 'chronos_time_rewind') return false;
            const rule = ABILITY_SKILL_SERVER_RULES[s];
            if (rule.roleRestriction === 'escaper') return false;
            return ABILITY_SKILL_COSTS[s] > ABILITY_SKILL_COSTS[skillId];
          })
          .reduce(
            (max, s) => Math.max(max, ABILITY_SKILL_COSTS[s]),
            0,
          );
        // 최대 코스트가 클수록 패널티 증가 (6→270, 8→360, 10→450)
        const manaWastePenalty = otherHighCostAttackSkillMaxCost > 0
          ? Math.round(otherHighCostAttackSkillMaxCost * 45)
          : 0;

        for (const path of basePaths.slice(0, 3)) {
          for (let step = 0; step <= path.length; step += 1) {
            const origin = getSequencePosition(bot.position, path, step);
            const affected =
              skillId === 'ember_blast'
                ? getCrossPositions(origin)
                : getNovaPositions(origin);
            const aoeScore = this.scoreAreaAgainstModel(
              affected,
              opponentModel,
              step,
            );
            candidates.push({
              path,
              skills: [{ skillId, step, order: 0 }],
              score:
                this.scorePathCoverageAgainstModel(
                  bot.position,
                  path,
                  opponent.position,
                  opponentModel,
                  effectiveObstacles,
                ) +
                aoeScore -
                manaWastePenalty,
              reason: `${skillId}:${step}`,
              selectedSkill: skillId,
            });
          }
        }
      }
    }

    return candidates
      .map((candidate) =>
        this.validatePlan(bot, candidate.path, candidate.skills)
          ? candidate
          : null,
      )
      .filter((candidate): candidate is BotActionCandidate => !!candidate)
      .sort((left, right) => right.score - left.score)
      .slice(0, 18);
  }

  private scoreBotActionCandidate(
    bot: AbilityPlayerState,
    opponent: AbilityPlayerState,
    path: Position[],
    skills: AbilitySkillReservation[],
    opponentModel: BotPathModel,
    reason: string,
    obstacles: Position[] = this.obstacles,
  ): BotActionCandidate {
    const score =
      bot.role === 'attacker'
        ? scoreAttackPathAgainstModel(
            bot.position,
            path,
            opponent.position,
            opponentModel,
            obstacles,
          )
        : scoreEscapePathAgainstModel(
            bot.position,
            path,
            opponent.position,
            opponentModel,
            obstacles,
          );
    return {
      path,
      skills,
      score,
      reason,
      selectedSkill: skills[0]?.skillId ?? null,
    };
  }

  private scorePathCoverageAgainstModel(
    start: Position,
    path: Position[],
    opponentStart: Position,
    model: BotPathModel,
    obstacles: Position[] = this.obstacles,
  ): number {
    return scoreAttackPathAgainstModel(
      start,
      path,
      opponentStart,
      model,
      obstacles,
    );
  }

  private scoreExpandedCoverageAgainstModel(
    start: Position,
    path: Position[],
    opponentStart: Position,
    model: BotPathModel,
    obstacles: Position[] = this.obstacles,
  ): number {
    const sequence = [start, ...path];
    let score = 0;
    for (let index = 0; index < sequence.length; index += 1) {
      const covered = getSquarePositions(sequence[index], 1);
      score += this.scoreAreaAgainstModel(covered, model, index);
    }
    score += this.scorePathCoverageAgainstModel(start, path, opponentStart, model, obstacles);
    return score;
  }

  private scoreAreaAgainstModel(
    positions: Position[],
    model: BotPathModel,
    step: number,
  ): number {
    return positions.reduce((sum, position) => {
      return (
        sum +
        (model.heatmap.get(toKey(position)) ?? 0) * 22 +
        (model.timeHeatmap.get(`${step}:${toKey(position)}`) ?? 0) * 26
      );
    }, 0);
  }

  private recordTurnSnapshot(player: AbilityPlayerState): void {
    const existingIndex = player.turnHistory.findIndex(
      (snapshot) => snapshot.turn === this.turn,
    );
    const nextSnapshot: AbilityTurnSnapshot = {
      turn: this.turn,
      position: { ...player.position },
      hp: player.hp,
    };

    if (existingIndex >= 0) {
      player.turnHistory[existingIndex] = nextSnapshot;
    } else {
      player.turnHistory.push(nextSnapshot);
    }

    if (player.turnHistory.length > 3) {
      player.turnHistory = player.turnHistory.slice(player.turnHistory.length - 3);
    }
  }

  private getTimeRewindSnapshot(player: AbilityPlayerState): AbilityTurnSnapshot | null {
    if (player.turnHistory.length === 0) return null;
    return player.turnHistory[player.turnHistory.length - 1] ?? null;
  }

  private findLethalStep(
    color: PlayerColor,
    payload: AbilityResolutionPayload,
  ): number | null {
    let lethalStep: number | null = null;

    for (const collision of payload.collisions) {
      if (collision.escapeeColor !== color || collision.newHp > 0) continue;
      lethalStep = collision.step;
    }

    for (const event of payload.skillEvents) {
      const lethalDamage = event.damages?.some(
        (damage) => damage.color === color && damage.newHp <= 0,
      );
      if (!lethalDamage) continue;
      lethalStep = event.step;
    }

    return lethalStep;
  }

  private applyTimeRewindIfNeeded(
    color: PlayerColor,
    player: AbilityPlayerState,
    resolution: {
      payload: AbilityResolutionPayload;
      redState: Pick<AbilityPlayerState, 'position' | 'hp' | 'mana' | 'invulnerableSteps' | 'pendingManaBonus' | 'pendingOverdriveStage' | 'pendingVoidCloak' | 'overdriveActive' | 'reboundLocked'>;
      blueState: Pick<AbilityPlayerState, 'position' | 'hp' | 'mana' | 'invulnerableSteps' | 'pendingManaBonus' | 'pendingOverdriveStage' | 'pendingVoidCloak' | 'overdriveActive' | 'reboundLocked'>;
      winner: PlayerColor | 'draw' | null;
    },
  ): void {
    const nextState = color === 'red' ? resolution.redState : resolution.blueState;
    if (nextState.hp > 0) return;
    if (player.timeRewindUsed) return;
    if (!player.equippedSkills.includes('chronos_time_rewind')) return;

    const rewindSnapshot = this.getTimeRewindSnapshot(player);
    if (!rewindSnapshot) return;

    const lethalStep = this.findLethalStep(color, resolution.payload);
    if (lethalStep === null) return;

    player.timeRewindUsed = true;
    const path = color === 'red' ? resolution.payload.redPath : resolution.payload.bluePath;
    const turnStart =
      color === 'red' ? resolution.payload.redStart : resolution.payload.blueStart;
    const finalStep = Math.max(
      resolution.payload.redPath.length,
      resolution.payload.bluePath.length,
    );
    const rewindFrom =
      path.length > 0
        ? { ...path[path.length - 1] }
        : { ...turnStart };
    const traversedPath = [...path].reverse();
    nextState.position = { ...rewindSnapshot.position };
    nextState.hp = rewindSnapshot.hp;

    resolution.payload.skillEvents.push({
      step: finalStep,
      order: 999,
      color,
      skillId: 'chronos_time_rewind',
      from: rewindFrom,
      to: { ...rewindSnapshot.position },
      affectedPositions: traversedPath.map((position) => ({ ...position })),
      rewindHp: rewindSnapshot.hp,
    });

    const redHp = resolution.redState.hp;
    const blueHp = resolution.blueState.hp;
    resolution.winner =
      redHp <= 0 && blueHp <= 0
        ? 'draw'
        : redHp <= 0
          ? 'blue'
          : blueHp <= 0
            ? 'red'
            : null;
  }

  private resetPlayers(): void {
    const initial = getInitialPositions();
    for (const [color, player] of this.players.entries()) {
      player.hp = ABILITY_STARTING_HP;
      player.position =
        this.trainingMode && player.isBot
          ? { ...TRAINING_DUMMY_POSITION }
          : { ...initial[color] };
      player.plannedPath = [];
      player.previousTurnStart = null;
      player.previousTurnPath = [];
      player.plannedSkills = [];
      player.pathSubmitted = false;
      player.mana = this.trainingMode ? TRAINING_STARTING_MANA : INITIAL_MANA;
      player.invulnerableSteps = 0;
      player.pendingManaBonus = 0;
      player.pendingOverdriveStage = 0;
      player.pendingVoidCloak = false;
      player.overdriveActive = false;
      player.reboundLocked = false;
      player.hidden = false;
      player.timeRewindUsed = false;
      player.turnHistory = [];
      player.disconnectLossRecorded = false;
    }
  }

  private updateRoles(): void {
    for (const [color, player] of this.players.entries()) {
      player.role = color === this.attackerColor ? 'attacker' : 'escaper';
    }
  }

  private resetGame(): void {
    this.timer.clear();
    this.clearPendingTimeouts();
    this.turn = 1;
    this.attackerColor = 'red';
    this.phase = 'waiting';
    this.obstacles = [];
    this.lavaTiles = [];
    this.trapTiles = [];
    this.resetPlayers();
    this.updateRoles();
    this.readySockets.clear();
    this.pendingStart = false;
    this.pendingStartPaused = false;
    this.rewardsGranted = false;
  }

  private touchActivity(timestamp = Date.now()): void {
    this.lastActivityAt = timestamp;
  }

  private hasBothPlayers(): boolean {
    return this.players.has('red') && this.players.has('blue');
  }

  private clearPlanningGraceTimeout(): void {
    if (this.planningGraceTimeout) {
      clearTimeout(this.planningGraceTimeout);
      this.planningGraceTimeout = null;
    }
  }

  private clearMovingCompleteTimeout(): void {
    if (this.movingCompleteTimeout) {
      clearTimeout(this.movingCompleteTimeout);
      this.movingCompleteTimeout = null;
    }
  }

  private clearNextRoundTimeout(): void {
    if (this.nextRoundTimeout) {
      clearTimeout(this.nextRoundTimeout);
      this.nextRoundTimeout = null;
    }
  }

  private clearPendingTimeouts(): void {
    this.clearPlanningGraceTimeout();
    this.clearMovingCompleteTimeout();
    this.clearNextRoundTimeout();
  }
}
