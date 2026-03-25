import { Server, Socket } from 'socket.io';
import type { PieceSkin, PlayerColor, Position } from '../../types/game.types';
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
  type AbilityBattleState,
  type AbilityPlayerState,
  type AbilityRoundStartPayload,
  type AbilitySkillId,
  type AbilitySkillReservation,
} from './AbilityTypes';
import { resolveAbilityRound } from './AbilityEngine';

const PLANNING_TIME_MS = 7000;
const SUBMIT_GRACE_MS = 350;
const INITIAL_MANA = 4;
const MAX_MANA = 10;
const MANA_PER_TURN = 2;
const SKILL_EVENT_BUFFER_MS = 1300;

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

const SKILL_COSTS: Record<AbilitySkillId, number> = {
  classic_guard: 4,
  ember_blast: 4,
  nova_blast: 4,
  quantum_shift: 3,
  plasma_charge: 2,
  electric_blitz: 6,
  cosmic_bigbang: 10,
};

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
  private readySockets = new Set<string>();
  private pendingStart = false;
  private pendingStartPaused = false;
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

  addPlayer(
    socket: Socket,
    nickname: string,
    userId: string | null,
    stats: { wins: number; losses: number },
    pieceSkin: PieceSkin,
    equippedSkills: AbilitySkillId[],
  ): PlayerColor | null {
    if (this.isFull) return null;
    const color: PlayerColor = this.players.size === 0 ? 'red' : 'blue';
    const initialPositions = getInitialPositions();
    this.players.set(color, {
      id: userId ?? socket.id,
      userId,
      socketId: socket.id,
      nickname,
      color,
      pieceSkin,
      hp: 3,
      position: { ...initialPositions[color] },
      plannedPath: [],
      plannedSkills: [],
      pathSubmitted: false,
      role: color === 'red' ? 'attacker' : 'escaper',
      stats,
      mana: INITIAL_MANA,
      invulnerableSteps: 0,
      pendingManaBonus: 0,
      equippedSkills,
    });
    socket.join(this.roomId);
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
    const humanSocketIds = [...this.players.values()].map((entry) => entry.socketId);
    const allReady = humanSocketIds.length === 2 && humanSocketIds.every((id) => this.readySockets.has(id));
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
    this.io.to(this.roomId).emit('ability_game_start', this.toClientState());
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
      this.players.delete(color);
      this.timer.clear();
      this.clearPendingTimeouts();
      this.readySockets.clear();
      this.pendingStart = false;
      this.pendingStartPaused = false;
      const wasActive = this.phase === 'planning' || this.phase === 'moving';
      if (wasActive && this.players.size === 1) {
        winnerColor = [...this.players.keys()][0] ?? null;
        shouldAwardDisconnectResult = winnerColor !== null;
        if (winnerColor) this.phase = 'gameover';
      }
      this.touchActivity();
      break;
    }

    return { disconnectedColor, shouldAwardDisconnectResult, winnerColor };
  }

  toClientState(): AbilityBattleState {
    const red = this.players.get('red')!;
    const blue = this.players.get('blue')!;
    return {
      roomId: this.roomId,
      code: this.code,
      turn: this.turn,
      phase: this.phase,
      pathPoints: calcPathPoints(this.turn),
      obstacles: this.obstacles,
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
    red.mana = Math.min(MAX_MANA, red.mana + MANA_PER_TURN);
    blue.mana = Math.min(MAX_MANA, blue.mana + MANA_PER_TURN);
    red.mana = Math.min(MAX_MANA, red.mana + red.pendingManaBonus);
    blue.mana = Math.min(MAX_MANA, blue.mana + blue.pendingManaBonus);
    red.pendingManaBonus = 0;
    blue.pendingManaBonus = 0;
    this.obstacles = generateObstacles(this.roomId, this.turn, red.position, blue.position);

    const now = Date.now();
    this.touchActivity(now);
    const payload: AbilityRoundStartPayload = {
      turn: this.turn,
      pathPoints: calcPathPoints(this.turn),
      attackerColor: this.attackerColor,
      redPosition: red.position,
      bluePosition: blue.position,
      obstacles: this.obstacles,
      timeLimit: 7,
      serverTime: now,
      roundEndsAt: now + PLANNING_TIME_MS,
      state: this.toClientState(),
    };
    this.io.to(this.roomId).emit('ability_round_start', payload);
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

    const resolution = resolveAbilityRound({
      red,
      blue,
      attackerColor: this.attackerColor,
      obstacles: this.obstacles,
    });

    red.position = resolution.redState.position;
    red.hp = resolution.redState.hp;
    red.mana = resolution.redState.mana;
    red.invulnerableSteps = resolution.redState.invulnerableSteps;
    red.pendingManaBonus = resolution.redState.pendingManaBonus;
    blue.position = resolution.blueState.position;
    blue.hp = resolution.blueState.hp;
    blue.mana = resolution.blueState.mana;
    blue.invulnerableSteps = resolution.blueState.invulnerableSteps;
    blue.pendingManaBonus = resolution.blueState.pendingManaBonus;

    this.touchActivity();
    this.io.to(this.roomId).emit('ability_resolution', resolution.payload);

    const animTime = calcAnimationDuration(
      Math.max(red.plannedPath.length, blue.plannedPath.length) + resolution.payload.skillEvents.length,
    ) + resolution.payload.skillEvents.length * SKILL_EVENT_BUFFER_MS;

    this.clearMovingCompleteTimeout();
    this.movingCompleteTimeout = setTimeout(() => {
      this.movingCompleteTimeout = null;
      this.onMovingComplete(resolution.winner);
    }, animTime);
  }

  private onMovingComplete(winner: PlayerColor | 'draw' | null): void {
    if (this.phase !== 'moving') return;
    if (!this.hasBothPlayers()) return;

    if (winner) {
      this.phase = 'gameover';
      if (winner !== 'draw' && !this.rewardsGranted) {
        const loserColor: PlayerColor = winner === 'red' ? 'blue' : 'red';
        this.players.get(winner)!.stats.wins += 1;
        this.players.get(loserColor)!.stats.losses += 1;
        void recordMatchmakingResult(this.players.get(winner)?.userId ?? null, this.players.get(loserColor)?.userId ?? null);
        void Promise.all([
          grantDailyRewardTokens([this.players.get(winner)?.userId ?? null], 6),
        ]);
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
    const pathPoints = calcPathPoints(this.turn);
    const uniqueSkills = Array.from(new Map(skills.map((skill) => [skill.skillId, skill])).values())
      .map((skill) => ({ ...skill, target: skill.target ?? null }))
      .sort((left, right) => left.order - right.order);

    const manaCost = uniqueSkills.reduce((sum, skill) => sum + SKILL_COSTS[skill.skillId], 0);
    if (manaCost > player.mana) return null;

    const hasGuard = uniqueSkills.some((skill) => skill.skillId === 'classic_guard');
    const teleport = uniqueSkills.find((skill) => skill.skillId === 'quantum_shift') ?? null;
    const hasBlitz = uniqueSkills.some((skill) => skill.skillId === 'electric_blitz');
    const blitz = uniqueSkills.find((skill) => skill.skillId === 'electric_blitz') ?? null;
    const hasAttackSkill = uniqueSkills.some(
      (skill) =>
        skill.skillId === 'ember_blast' ||
        skill.skillId === 'nova_blast' ||
        skill.skillId === 'electric_blitz' ||
        skill.skillId === 'cosmic_bigbang',
    );
    const hasBigBang = uniqueSkills.some((skill) => skill.skillId === 'cosmic_bigbang');
    const bigBang = uniqueSkills.find((skill) => skill.skillId === 'cosmic_bigbang') ?? null;
    const hasCharge = uniqueSkills.some((skill) => skill.skillId === 'plasma_charge');

    if (hasGuard && player.role !== 'escaper') return null;
    if (hasAttackSkill && player.role !== 'attacker') return null;

    if (hasGuard) {
      const guardSkill = uniqueSkills.find((skill) => skill.skillId === 'classic_guard');
      if (!guardSkill || guardSkill.step !== 0 || path.length > 0) return null;
    }

    if (hasCharge) {
      const chargeSkill = uniqueSkills.find((skill) => skill.skillId === 'plasma_charge');
      if (!chargeSkill || chargeSkill.step !== 0 || path.length > 0) return null;
      const invalidCombo = uniqueSkills.some(
        (skill) => skill.skillId !== 'plasma_charge' && skill.skillId !== 'classic_guard',
      );
      if (invalidCombo) return null;
    }

    if (hasBigBang) {
      if (!bigBang || bigBang.step !== 0 || path.length > 0) return null;
      if (uniqueSkills.length !== 1) return null;
      return {
        path: [],
        skills: uniqueSkills,
      };
    }

    if (hasBlitz) {
      if (!blitz || !blitz.target) return null;
      if (uniqueSkills.length !== 1) return null;
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

    if (teleport) {
      if (!teleport.target) return null;
      if (teleport.step < 0 || teleport.step > path.length) return null;
      const teleportOrigin =
        teleport.step === 0 ? player.position : path[teleport.step - 1];
      if (!teleportOrigin) return null;
      const rowDelta = Math.abs(teleport.target.row - teleportOrigin.row);
      const colDelta = Math.abs(teleport.target.col - teleportOrigin.col);
      if (rowDelta > 1 || colDelta > 1 || (rowDelta === 0 && colDelta === 0)) return null;
      if (this.obstacles.some((obstacle) => obstacle.row === teleport.target!.row && obstacle.col === teleport.target!.col)) return null;
      if (teleport.target.row < 0 || teleport.target.row > 4 || teleport.target.col < 0 || teleport.target.col > 4) return null;
    }

    if (teleport) {
      const prefixPath = path.slice(0, teleport.step);
      const suffixPath = path.slice(teleport.step);
      if (!isValidPath(player.position, prefixPath, hasGuard ? 0 : pathPoints, this.obstacles)) return null;
      if (!isValidPath(teleport.target!, suffixPath, hasGuard ? 0 : pathPoints, this.obstacles)) return null;
    } else if (!isValidPath(player.position, path, hasGuard ? 0 : pathPoints, this.obstacles)) {
      return null;
    }

    for (const skill of uniqueSkills) {
      if ((skill.skillId === 'ember_blast' || skill.skillId === 'nova_blast') && skill.step > path.length) return null;
      if (skill.skillId === 'classic_guard' && skill.step !== 0) return null;
      if (skill.skillId === 'cosmic_bigbang' && skill.step !== 0) return null;
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
      equippedSkills: player.equippedSkills,
    };
  }

  private resetPlayers(): void {
    const initial = getInitialPositions();
    for (const [color, player] of this.players.entries()) {
      player.hp = 3;
      player.position = { ...initial[color] };
      player.plannedPath = [];
      player.plannedSkills = [];
      player.pathSubmitted = false;
      player.mana = INITIAL_MANA;
      player.invulnerableSteps = 0;
      player.pendingManaBonus = 0;
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
