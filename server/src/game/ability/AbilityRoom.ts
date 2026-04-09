import { Server, Socket } from 'socket.io';
import type { BoardSkin, PieceSkin, PlayerColor, Position } from '../../types/game.types';
import {
  calcAnimationDuration,
  calcPathPoints,
  generateObstacles,
  getInitialPositions,
  isValidPath,
  toClientPlayer,
} from '../GameEngine';
import { ServerTimer } from '../ServerTimer';
import { grantDailyRewardTokens, recordMatchmakingResult } from '../../services/playerAuth';
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
const TRAINING_DUMMY_POSITION: Position = { row: 2, col: 2 };

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
      event.skillId !== 'gold_overdrive'
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
  ): PlayerColor | null {
    if (this.isFull) return null;
    const color: PlayerColor = this.players.size === 0 ? 'red' : 'blue';
    const initialPositions = getInitialPositions();
    this.players.set(color, {
      id: `bot:${this.roomId}:${color}`,
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
      stats: { wins: 0, losses: 0 },
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
    if (red.isBot) {
      red.pathSubmitted = true;
      red.plannedPath = [];
      red.plannedSkills = [];
    }
    if (blue.isBot) {
      blue.pathSubmitted = true;
      blue.plannedPath = [];
      blue.plannedSkills = [];
    }
    this.recordTurnSnapshot(red);
    this.recordTurnSnapshot(blue);
    this.obstacles = generateObstacles(this.roomId, this.turn, red.position, blue.position);

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
    void recordAbilityUtilityUsage({
      byUserId: collectUtilitySkillUsageByUser(
        this.players,
        resolution.payload.skillEvents,
      ),
    });
    void recordAbilityBlockEvents({
      byUserId: collectBlockEventsByUser(this.players, resolution.payload.blocks),
    });

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
        this.players.get(winner)!.stats.wins += 1;
        this.players.get(loserColor)!.stats.losses += 1;
        void recordMatchmakingResult(winnerUserId, this.players.get(loserColor)?.userId ?? null);
        void Promise.all([
          grantDailyRewardTokens([winnerUserId], 6),
        ]);
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
    const blitz = uniqueSkills.find((skill) => skill.skillId === 'electric_blitz') ?? null;
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

    if (player.reboundLocked && path.length > 0) return null;

    if (!isOverdriveTurn) {
      if (hasBigBang) {
        if (!bigBang) return null;
        if (uniqueSkills.length !== 1) return null;
        return {
          path: [],
          skills: uniqueSkills,
        };
      }

      if (hasBlitz) {
        if (!blitz || !blitz.target) return null;
        if (blitz.step < 0 || blitz.step > path.length) return null;

        const prefixPath = path.slice(0, blitz.step);
        if (!isValidPath(player.position, prefixPath, pathPoints, this.obstacles)) {
          return null;
        }

        const blitzOrigin =
          blitz.step === 0 ? player.position : prefixPath[prefixPath.length - 1];
        if (!blitzOrigin) return null;

        const blitzPath = buildBlitzPath(blitzOrigin, blitz.target);
        if (blitzPath.length === 0) return null;

        const expectedPath = [...prefixPath, ...blitzPath];
        if (path.length !== expectedPath.length) return null;
        for (let index = 0; index < expectedPath.length; index++) {
          if (!posEqual(path[index], expectedPath[index])) return null;
        }

        return {
          path: expectedPath,
          skills: uniqueSkills,
        };
      }

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
      } else if (!isValidPath(player.position, path, hasGuard ? 0 : pathPoints, validationObstacles)) {
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

    const movementSkills = uniqueSkills
      .filter((skill) => skill.skillId === 'quantum_shift' || skill.skillId === 'electric_blitz')
      .sort((left, right) => {
        if (left.step !== right.step) return left.step - right.step;
        return left.order - right.order;
      });

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
    };
  }

  private currentPathPoints(): number {
    const hasDisconnectedHuman = [...this.players.values()].some(
      (player) => player.connected === false && !player.isBot,
    );
    return hasDisconnectedHuman ? 30 : calcPathPoints(this.turn);
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
