import { Server, Socket } from 'socket.io';
import type { PieceSkin, Position } from '../../types/game.types';
import { ServerTimer } from '../ServerTimer';
import {
  calcTwoVsTwoPathPoints,
  generateTwoVsTwoObstacles,
  getSlotTeam,
  getTwoVsTwoInitialPositions,
  isValidTwoVsTwoPath,
  resolveTwoVsTwoMovement,
  TWO_VS_TWO_SLOTS,
} from './TwoVsTwoEngine';
import type {
  TwoVsTwoClientPlayerState,
  TwoVsTwoClientState,
  TwoVsTwoPhase,
  TwoVsTwoResolutionPayload,
  TwoVsTwoResult,
  TwoVsTwoRoundStartPayload,
  TwoVsTwoRole,
  TwoVsTwoSlot,
  TwoVsTwoTeam,
  TwoVsTwoPlayerState,
} from './TwoVsTwoTypes';

const PLANNING_TIME_MS = 7_000;
const SUBMIT_GRACE_MS = 350;
const MOVEMENT_STEP_MS = 200;
const MOVEMENT_SETTLE_MS = 300;

function calcAnimationDuration(maxSteps: number): number {
  return Math.max(350, maxSteps * MOVEMENT_STEP_MS + MOVEMENT_SETTLE_MS);
}

export class TwoVsTwoRoom {
  readonly roomId: string;
  readonly code: string;
  private io: Server;
  private phase: TwoVsTwoPhase = 'waiting';
  private players = new Map<TwoVsTwoSlot, TwoVsTwoPlayerState>();
  private turn = 1;
  private attackerTeam: TwoVsTwoTeam = 'red';
  private obstacles: Position[] = [];
  private timer = new ServerTimer();
  private readySockets = new Set<string>();
  private pendingStart = false;
  private rematchSet = new Set<string>();
  private gameResult: TwoVsTwoResult | null = null;
  private planningGraceTimeout: ReturnType<typeof setTimeout> | null = null;
  private nextRoundTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(roomId: string, code: string, io: Server) {
    this.roomId = roomId;
    this.code = code;
    this.io = io;
  }

  get playerCount(): number {
    return this.players.size;
  }

  get currentResult(): TwoVsTwoResult | null {
    return this.gameResult;
  }

  addPlayer(
    socket: Socket,
    nickname: string,
    userId: string | null,
    stats: { wins: number; losses: number },
    pieceSkin: PieceSkin,
  ): TwoVsTwoSlot | null {
    if (this.players.size >= 4) return null;
    const slot = TWO_VS_TWO_SLOTS.find((entry) => !this.players.has(entry)) ?? null;
    if (!slot) return null;
    const positions = getTwoVsTwoInitialPositions();
    this.players.set(slot, {
      id: userId ?? socket.id,
      userId,
      socketId: socket.id,
      nickname,
      color: getSlotTeam(slot),
      team: getSlotTeam(slot),
      slot,
      pieceSkin,
      hp: 3,
      position: { ...positions[slot] },
      plannedPath: [],
      pathSubmitted: false,
      role: getSlotTeam(slot) === 'red' ? 'attacker' : 'escaper',
      stats,
    });
    socket.join(this.roomId);
    return slot;
  }

  removePlayer(socketId: string): void {
    for (const [slot, player] of this.players.entries()) {
      if (player.socketId !== socketId) continue;
      this.players.delete(slot);
      this.timer.clear();
      this.clearPlanningGraceTimeout();
      this.clearNextRoundTimeout();
      this.readySockets.clear();
      this.pendingStart = false;
      this.phase = 'gameover';
      this.gameResult = this.getWinningTeamOnDisconnect(slot);
      return;
    }
  }

  updatePlayerSkin(socketId: string, pieceSkin: PieceSkin): void {
    const player = this.getPlayerBySocket(socketId);
    if (!player) return;
    player.pieceSkin = pieceSkin;
    this.io.to(this.roomId).emit('player_skin_updated', {
      slot: player.slot,
      pieceSkin,
    });
  }

  prepareGameStart(): void {
    this.pendingStart = true;
    this.readySockets.clear();
  }

  markClientReady(socketId: string): boolean {
    if (!this.pendingStart) return false;
    const player = this.getPlayerBySocket(socketId);
    if (!player) return false;
    this.readySockets.add(socketId);
    const allReady =
      this.players.size === 4 &&
      [...this.players.values()].every((entry) => this.readySockets.has(entry.socketId));
    if (!allReady) return false;
    this.startGame();
    return true;
  }

  startGame(): void {
    this.pendingStart = false;
    this.readySockets.clear();
    this.rematchSet.clear();
    this.gameResult = null;
    this.turn = 1;
    this.attackerTeam = 'red';
    this.phase = 'planning';
    this.resetPlayers();
    this.updateRoles();
    this.obstacles = generateTwoVsTwoObstacles(this.roomId, this.turn, this.getPositions());
    this.io.to(this.roomId).emit('twovtwo_game_start', this.toClientState());
    this.emitRoundStart();
  }

  updatePlannedPath(socketId: string, path: Position[]): void {
    if (this.phase !== 'planning') return;
    const player = this.getPlayerBySocket(socketId);
    if (!player || player.pathSubmitted || player.hp <= 0) return;
    const maxPoints = calcTwoVsTwoPathPoints(this.turn);
    if (!isValidTwoVsTwoPath(player.position, path, maxPoints, this.obstacles)) return;
    player.plannedPath = path;
    this.io.to(this.roomId).emit('twovtwo_path_updated', {
      slot: player.slot,
      team: player.team,
      path,
    });
  }

  submitPath(socketId: string, path: Position[]): { ok: boolean; acceptedPath: Position[] } {
    if (this.phase !== 'planning') return { ok: false, acceptedPath: [] };
    const player = this.getPlayerBySocket(socketId);
    if (!player || player.pathSubmitted || player.hp <= 0) {
      return { ok: false, acceptedPath: [] };
    }

    const maxPoints = calcTwoVsTwoPathPoints(this.turn);
    player.plannedPath = isValidTwoVsTwoPath(player.position, path, maxPoints, this.obstacles)
      ? path
      : isValidTwoVsTwoPath(player.position, player.plannedPath, maxPoints, this.obstacles)
        ? player.plannedPath
        : [];
    player.pathSubmitted = true;

    this.io.to(this.roomId).emit('twovtwo_player_submitted', {
      slot: player.slot,
      team: player.team,
      path: player.plannedPath,
    });

    if (this.allAlivePlayersSubmitted()) {
      this.timer.clear();
      this.resolveRound();
    }

    return { ok: true, acceptedPath: player.plannedPath };
  }

  requestRematch(socketId: string): void {
    if (this.phase !== 'gameover') return;
    if (this.rematchSet.has(socketId)) return;
    this.rematchSet.add(socketId);
    if (this.rematchSet.size < this.players.size) {
      this.io.to(this.roomId).emit('rematch_requested', {});
      return;
    }
    this.startGame();
  }

  sendChat(socketId: string, message: string): void {
    const player = this.getPlayerBySocket(socketId);
    if (!player) return;
    this.io.to(this.roomId).emit('chat_receive', {
      sender: player.nickname,
      color: player.team,
      message: message.slice(0, 200),
      timestamp: Date.now(),
    });
  }

  getSocketIds(): string[] {
    return [...this.players.values()].map((player) => player.socketId);
  }

  toClientState(): TwoVsTwoClientState {
    const players = Object.fromEntries(
      TWO_VS_TWO_SLOTS.map((slot) => [slot, this.toClientPlayer(this.players.get(slot)!)]),
    ) as Record<TwoVsTwoSlot, TwoVsTwoClientPlayerState>;
    return {
      roomId: this.roomId,
      code: this.code,
      turn: this.turn,
      phase: this.phase,
      pathPoints: calcTwoVsTwoPathPoints(this.turn),
      obstacles: this.obstacles.map((obstacle) => ({ ...obstacle })),
      attackerTeam: this.attackerTeam,
      players,
      gameResult: this.gameResult,
    };
  }

  private emitRoundStart(): void {
    if (this.players.size < 4) return;
    this.phase = 'planning';
    this.updateRoles();
    this.obstacles = generateTwoVsTwoObstacles(this.roomId, this.turn, this.getPositions());
    for (const player of this.players.values()) {
      player.pathSubmitted = player.hp <= 0;
      player.plannedPath = [];
    }
    const now = Date.now();
    const payload: TwoVsTwoRoundStartPayload = {
      state: this.toClientState(),
      timeLimit: 7,
      serverTime: now,
      roundEndsAt: now + PLANNING_TIME_MS,
    };
    this.io.to(this.roomId).emit('twovtwo_round_start', payload);
    this.timer.start(PLANNING_TIME_MS, () => this.onPlanningTimeout());
  }

  private onPlanningTimeout(): void {
    if (this.phase !== 'planning') return;
    this.clearPlanningGraceTimeout();
    this.planningGraceTimeout = setTimeout(() => {
      this.planningGraceTimeout = null;
      if (this.phase !== 'planning') return;
      const maxPoints = calcTwoVsTwoPathPoints(this.turn);
      for (const player of this.players.values()) {
        if (player.pathSubmitted || player.hp <= 0) continue;
        player.plannedPath = isValidTwoVsTwoPath(
          player.position,
          player.plannedPath,
          maxPoints,
          this.obstacles,
        )
          ? player.plannedPath
          : [];
        player.pathSubmitted = true;
      }
      this.resolveRound();
    }, SUBMIT_GRACE_MS);
  }

  private resolveRound(): void {
    if (this.players.size < 4) return;
    const starts = this.getPositions();
    const paths = Object.fromEntries(
      TWO_VS_TWO_SLOTS.map((slot) => {
        const player = this.players.get(slot)!;
        return [slot, player.hp > 0 ? [...player.plannedPath] : []];
      }),
    ) as Record<TwoVsTwoSlot, Position[]>;
    const hps = Object.fromEntries(
      TWO_VS_TWO_SLOTS.map((slot) => [slot, this.players.get(slot)!.hp]),
    ) as Record<TwoVsTwoSlot, number>;

    this.phase = 'moving';
    const resolution = resolveTwoVsTwoMovement({
      starts,
      paths,
      hps,
      attackerTeam: this.attackerTeam,
    });

    const payload: TwoVsTwoResolutionPayload = {
      starts,
      paths,
      playerHits: resolution.playerHits,
    };
    this.io.to(this.roomId).emit('twovtwo_resolution', payload);

    this.clearNextRoundTimeout();
    const maxSteps = Math.max(...TWO_VS_TWO_SLOTS.map((slot) => paths[slot].length + 1), 1);
    const animTime = calcAnimationDuration(maxSteps);
    this.nextRoundTimeout = setTimeout(() => {
      this.nextRoundTimeout = null;
      for (const slot of TWO_VS_TWO_SLOTS) {
        const player = this.players.get(slot)!;
        player.position = resolution.ends[slot];
        player.hp = resolution.hps[slot];
        player.pathSubmitted = false;
        player.plannedPath = [];
      }

      const redAlive =
        (this.players.get('red_top')?.hp ?? 0) > 0 ||
        (this.players.get('red_bottom')?.hp ?? 0) > 0;
      const blueAlive =
        (this.players.get('blue_top')?.hp ?? 0) > 0 ||
        (this.players.get('blue_bottom')?.hp ?? 0) > 0;

      if (!redAlive && !blueAlive) {
        this.phase = 'gameover';
        this.gameResult = 'draw';
        this.io.to(this.roomId).emit('twovtwo_game_over', { result: 'draw' });
        return;
      }
      if (!redAlive || !blueAlive) {
        this.phase = 'gameover';
        this.gameResult = redAlive ? 'red' : 'blue';
        this.io.to(this.roomId).emit('twovtwo_game_over', { result: this.gameResult });
        return;
      }

      this.turn += 1;
      this.attackerTeam = this.attackerTeam === 'red' ? 'blue' : 'red';
      this.emitRoundStart();
    }, animTime);
  }

  private getPositions(): Record<TwoVsTwoSlot, Position> {
    return Object.fromEntries(
      TWO_VS_TWO_SLOTS.map((slot) => [slot, { ...this.players.get(slot)!.position }]),
    ) as Record<TwoVsTwoSlot, Position>;
  }

  private getPlayerBySocket(socketId: string): TwoVsTwoPlayerState | undefined {
    return [...this.players.values()].find((player) => player.socketId === socketId);
  }

  private toClientPlayer(player: TwoVsTwoPlayerState): TwoVsTwoClientPlayerState {
    return {
      id: player.id,
      nickname: player.nickname,
      color: player.team,
      slot: player.slot,
      team: player.team,
      pieceSkin: player.pieceSkin,
      hp: player.hp,
      position: { ...player.position },
      pathSubmitted: player.pathSubmitted,
      role: player.role,
      stats: player.stats,
    };
  }

  private resetPlayers(): void {
    const positions = getTwoVsTwoInitialPositions();
    for (const slot of TWO_VS_TWO_SLOTS) {
      const player = this.players.get(slot);
      if (!player) continue;
      player.hp = 3;
      player.position = { ...positions[slot] };
      player.pathSubmitted = false;
      player.plannedPath = [];
    }
  }

  private updateRoles(): void {
    for (const player of this.players.values()) {
      player.role = player.team === this.attackerTeam ? 'attacker' : 'escaper';
    }
  }

  private allAlivePlayersSubmitted(): boolean {
    return [...this.players.values()].every(
      (player) => player.hp <= 0 || player.pathSubmitted,
    );
  }

  private getWinningTeamOnDisconnect(disconnectedSlot: TwoVsTwoSlot): TwoVsTwoResult {
    return getSlotTeam(disconnectedSlot) === 'red' ? 'blue' : 'red';
  }

  private clearPlanningGraceTimeout(): void {
    if (this.planningGraceTimeout) {
      clearTimeout(this.planningGraceTimeout);
      this.planningGraceTimeout = null;
    }
  }

  private clearNextRoundTimeout(): void {
    if (this.nextRoundTimeout) {
      clearTimeout(this.nextRoundTimeout);
      this.nextRoundTimeout = null;
    }
  }
}
