import { Server, Socket } from 'socket.io';
import type { BoardSkin, PieceSkin, Position } from '../../types/game.types';
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
import { grantDailyRewardTokens } from '../../services/playerAuth';
import {
  recordMatchPlayed,
  recordModeWin,
} from '../../services/achievementService';
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
  private readonly createdAt = Date.now();
  private lastActivityAt = Date.now();
  private phase: TwoVsTwoPhase = 'waiting';
  private players = new Map<TwoVsTwoSlot, TwoVsTwoPlayerState>();
  private turn = 1;
  private attackerTeam: TwoVsTwoTeam = 'red';
  private obstacles: Position[] = [];
  private timer = new ServerTimer();
  private readySockets = new Set<string>();
  private pendingStart = false;
  private rematchSet = new Set<string>();
  private rematchQueuedTeams = new Set<TwoVsTwoTeam>();
  private gameResult: TwoVsTwoResult | null = null;
  private rewardsGranted = false;
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

  get connectedPlayerCount(): number {
    return [...this.players.values()].filter((player) => player.connected).length;
  }

  get currentPhase(): TwoVsTwoPhase {
    return this.phase;
  }

  get createdTimestamp(): number {
    return this.createdAt;
  }

  get lastActivityTimestamp(): number {
    return this.lastActivityAt;
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
    boardSkin: BoardSkin = 'classic',
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
      boardSkin,
      hp: 3,
      position: { ...positions[slot] },
      plannedPath: [],
      pathSubmitted: false,
      role: getSlotTeam(slot) === 'red' ? 'attacker' : 'escaper',
      connected: true,
      stats,
    });
    socket.join(this.roomId);
    this.touchActivity();
    return slot;
  }

  removePlayer(socketId: string): void {
    for (const [slot, player] of this.players.entries()) {
      if (player.socketId !== socketId) continue;
      if (this.phase === 'waiting' || this.pendingStart) {
        this.players.delete(slot);
        this.timer.clear();
        this.clearPlanningGraceTimeout();
        this.clearNextRoundTimeout();
        this.readySockets.clear();
        this.pendingStart = false;
        this.touchActivity();
        return;
      }

      player.connected = false;
      player.hp = 0;
      player.pathSubmitted = true;
      player.plannedPath = [];
      this.readySockets.delete(socketId);
      this.touchActivity();

      const result = this.getDisconnectWinner();
      if (result) {
        this.timer.clear();
        this.clearPlanningGraceTimeout();
        this.clearNextRoundTimeout();
        this.pendingStart = false;
        this.phase = 'gameover';
        this.gameResult = result;
        if (result !== 'draw' && !this.rewardsGranted) {
          this.rewardsGranted = true;
          void grantDailyRewardTokens(
            [...this.players.values()]
              .filter((entry) => entry.team === result)
              .map((entry) => entry.userId),
            6,
          );
          void recordMatchPlayed({
            userIds: [...this.players.values()].map((entry) => entry.userId),
            matchType: 'twovtwo',
          });
          void Promise.all(
            [...this.players.values()]
              .filter((entry) => entry.team === result)
              .map((entry) => recordModeWin({ userId: entry.userId, mode: 'twovtwo' })),
          );
        }
        this.io.to(this.roomId).emit('twovtwo_game_over', {
          result,
          message: 'A team disconnected.',
        });
        return;
      }

      this.io.to(this.roomId).emit('twovtwo_player_disconnected', {
        slot,
        state: this.toClientState(),
      });

      if (this.phase === 'planning' && this.allAlivePlayersSubmitted()) {
        this.timer.clear();
        this.clearPlanningGraceTimeout();
        this.resolveRound();
      }
      return;
    }
  }

  updatePlayerSkin(socketId: string, pieceSkin: PieceSkin): void {
    const player = this.getPlayerBySocket(socketId);
    if (!player) return;
    player.pieceSkin = pieceSkin;
    this.touchActivity();
    this.io.to(this.roomId).emit('player_skin_updated', {
      slot: player.slot,
      pieceSkin,
    });
  }

  prepareGameStart(): void {
    this.pendingStart = true;
    this.readySockets.clear();
    this.touchActivity();
  }

  markClientReady(socketId: string): boolean {
    if (!this.pendingStart) return false;
    const player = this.getPlayerBySocket(socketId);
    if (!player) return false;
    this.readySockets.add(socketId);
    this.touchActivity();
    const allReady =
      this.players.size === 4 &&
      [...this.players.values()].every(
        (entry) => entry.connected && this.readySockets.has(entry.socketId),
      );
    if (!allReady) return false;
    this.startGame();
    return true;
  }

  startGame(): void {
    this.pendingStart = false;
    this.readySockets.clear();
    this.rematchSet.clear();
    this.rematchQueuedTeams.clear();
    this.gameResult = null;
    this.rewardsGranted = false;
    this.turn = 1;
    this.attackerTeam = 'red';
    this.phase = 'planning';
    this.resetPlayers();
    this.updateRoles();
    this.obstacles = generateTwoVsTwoObstacles(
      this.roomId,
      this.turn,
      this.getActivePositions(),
    );
    this.touchActivity();
    const gameStartState = this.toClientState();
    this.io.to(this.roomId).emit('twovtwo_game_start', gameStartState);
    this.emitRoundStart();
  }

  updatePlannedPath(socketId: string, path: Position[]): void {
    if (this.phase !== 'planning') return;
    const player = this.getPlayerBySocket(socketId);
    if (!player || !player.connected || player.pathSubmitted || player.hp <= 0) return;
    const maxPoints = calcTwoVsTwoPathPoints(this.turn);
    if (!isValidTwoVsTwoPath(player.position, path, maxPoints, this.obstacles)) return;
    player.plannedPath = path;
    this.touchActivity();
    this.io.to(this.roomId).emit('twovtwo_path_updated', {
      slot: player.slot,
      team: player.team,
      path,
    });
  }

  submitPath(socketId: string, path: Position[]): { ok: boolean; acceptedPath: Position[] } {
    if (this.phase !== 'planning') return { ok: false, acceptedPath: [] };
    const player = this.getPlayerBySocket(socketId);
    if (!player || !player.connected || player.pathSubmitted || player.hp <= 0) {
      return { ok: false, acceptedPath: [] };
    }

    const maxPoints = calcTwoVsTwoPathPoints(this.turn);
    player.plannedPath = isValidTwoVsTwoPath(player.position, path, maxPoints, this.obstacles)
      ? path
      : isValidTwoVsTwoPath(player.position, player.plannedPath, maxPoints, this.obstacles)
        ? player.plannedPath
        : [];
    player.pathSubmitted = true;
    this.touchActivity();

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

  requestRematch(socketId: string):
    | { status: 'ignored' }
    | {
        status: 'waiting_teammate';
        teammateSocketId: string | null;
        team: TwoVsTwoTeam;
      }
    | {
        status: 'team_ready';
        team: TwoVsTwoTeam;
        members: Array<{
          socketId: string;
          nickname: string;
          userId: string | null;
          stats: { wins: number; losses: number };
          pieceSkin: PieceSkin;
          slot: TwoVsTwoSlot;
        }>;
      } {
    if (this.phase !== 'gameover') return { status: 'ignored' };
    if (this.rematchSet.has(socketId)) return { status: 'ignored' };

    const player = this.getPlayerBySocket(socketId);
    if (!player) return { status: 'ignored' };

    this.rematchSet.add(socketId);
    this.touchActivity();
    const team = player.team;
    const teamPlayers = [...this.players.values()].filter((entry) => entry.team === team);
    const teammate = teamPlayers.find((entry) => entry.socketId !== socketId) ?? null;
    const teamReady = teamPlayers.every((entry) => this.rematchSet.has(entry.socketId));

    if (!teamReady) {
      return {
        status: 'waiting_teammate',
        teammateSocketId: teammate?.socketId ?? null,
        team,
      };
    }

    if (this.rematchQueuedTeams.has(team)) {
      return { status: 'ignored' };
    }

    this.rematchQueuedTeams.add(team);
    return {
      status: 'team_ready',
      team,
      members: teamPlayers.map((entry) => ({
        socketId: entry.socketId,
        nickname: entry.nickname,
        userId: entry.userId,
        stats: entry.stats,
        pieceSkin: entry.pieceSkin,
        slot: entry.slot,
      })),
    };
  }

  sendChat(socketId: string, message: string): void {
    const player = this.getPlayerBySocket(socketId);
    if (!player) return;
    this.touchActivity();
    this.io.to(this.roomId).emit('chat_receive', {
      sender: player.nickname,
      color: player.team,
      message: message.slice(0, 200),
      timestamp: Date.now(),
    });
  }

  getSocketIds(): string[] {
    return [...this.players.values()]
      .filter((player) => player.connected)
      .map((player) => player.socketId);
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
    this.obstacles = generateTwoVsTwoObstacles(
      this.roomId,
      this.turn,
      this.getActivePositions(),
    );
    for (const player of this.players.values()) {
      player.pathSubmitted = !player.connected || player.hp <= 0;
      player.plannedPath = [];
    }
    const now = Date.now();
    this.touchActivity(now);
    const state = this.toClientState();
    const payload: TwoVsTwoRoundStartPayload = {
      state,
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
        if (!player.connected || player.pathSubmitted || player.hp <= 0) continue;
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
    this.touchActivity();
    this.io.to(this.roomId).emit('twovtwo_resolution', payload);

    this.clearNextRoundTimeout();
    const maxSteps = Math.max(...TWO_VS_TWO_SLOTS.map((slot) => paths[slot].length + 1), 1);
    const animTime = calcAnimationDuration(maxSteps);
    this.nextRoundTimeout = setTimeout(() => {
      this.nextRoundTimeout = null;
      for (const slot of TWO_VS_TWO_SLOTS) {
      const player = this.players.get(slot)!;
      if (player.connected) {
        player.position = resolution.ends[slot];
      }
      player.hp = resolution.hps[slot];
      player.pathSubmitted = false;
      player.plannedPath = [];
      }

      const redAlive =
        ((this.players.get('red_top')?.connected ?? false) &&
          (this.players.get('red_top')?.hp ?? 0) > 0) ||
        ((this.players.get('red_bottom')?.connected ?? false) &&
          (this.players.get('red_bottom')?.hp ?? 0) > 0);
      const blueAlive =
        ((this.players.get('blue_top')?.connected ?? false) &&
          (this.players.get('blue_top')?.hp ?? 0) > 0) ||
        ((this.players.get('blue_bottom')?.connected ?? false) &&
          (this.players.get('blue_bottom')?.hp ?? 0) > 0);

      if (!redAlive && !blueAlive) {
        this.phase = 'gameover';
        this.gameResult = 'draw';
        this.touchActivity();
        void recordMatchPlayed({
          userIds: [...this.players.values()].map((player) => player.userId),
          matchType: 'twovtwo',
        });
        this.io.to(this.roomId).emit('twovtwo_game_over', { result: 'draw' });
        return;
      }
      if (!redAlive || !blueAlive) {
        this.phase = 'gameover';
        this.gameResult = redAlive ? 'red' : 'blue';
        this.touchActivity();
        void recordMatchPlayed({
          userIds: [...this.players.values()].map((player) => player.userId),
          matchType: 'twovtwo',
        });
        if (!this.rewardsGranted) {
          this.rewardsGranted = true;
          void grantDailyRewardTokens(
            [...this.players.values()]
              .filter((entry) => entry.team === this.gameResult)
              .map((entry) => entry.userId),
            6,
          );
          void Promise.all(
            [...this.players.values()]
              .filter((entry) => entry.team === this.gameResult)
              .map((entry) => recordModeWin({ userId: entry.userId, mode: 'twovtwo' })),
          );
        }
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

  private getActivePositions(): Partial<Record<TwoVsTwoSlot, Position>> {
    return Object.fromEntries(
      TWO_VS_TWO_SLOTS.filter((slot) => {
        const player = this.players.get(slot);
        return player?.connected && (player.hp ?? 0) > 0;
      }).map((slot) => [slot, { ...this.players.get(slot)!.position }]),
    ) as Partial<Record<TwoVsTwoSlot, Position>>;
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
      connected: player.connected,
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
      player.connected = true;
    }
  }

  private updateRoles(): void {
    for (const player of this.players.values()) {
      player.role = player.team === this.attackerTeam ? 'attacker' : 'escaper';
    }
  }

  private allAlivePlayersSubmitted(): boolean {
    return [...this.players.values()].every(
      (player) => !player.connected || player.hp <= 0 || player.pathSubmitted,
    );
  }

  private getDisconnectWinner(): TwoVsTwoResult | null {
    const redConnected = [...this.players.values()].some(
      (player) => player.team === 'red' && player.connected,
    );
    const blueConnected = [...this.players.values()].some(
      (player) => player.team === 'blue' && player.connected,
    );

    if (!redConnected && !blueConnected) return 'draw';
    if (!redConnected) return 'blue';
    if (!blueConnected) return 'red';
    return null;
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

  private touchActivity(now = Date.now()): void {
    this.lastActivityAt = now;
  }
}

