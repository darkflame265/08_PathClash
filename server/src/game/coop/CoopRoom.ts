import { Server, Socket } from "socket.io";
import type {
  PieceSkin,
  PlayerColor,
  PlayerState,
  Position,
} from "../../types/game.types";
import {
  generateObstacles,
  getInitialPositions,
  toClientPlayer,
} from "../GameEngine";
import { ServerTimer } from "../ServerTimer";
import {
  calcCoopPathPoints,
  createCoopEnemyAttackPath,
  createCoopPortalBatch,
  createEnemyPreviews,
  isValidCoopPath,
  resolveCoopMovement,
} from "./CoopEngine";
import { grantDailyRewardTokens } from "../../services/playerAuth";
import type {
  CoopClientState,
  CoopEnemy,
  CoopEnemyPreview,
  CoopResolutionPayload,
  CoopResult,
  CoopRoundStartPayload,
} from "./CoopTypes";

const PLANNING_TIME_MS = 7_000;
const SUBMIT_GRACE_MS = 350;
const FINAL_PORTAL_COUNT = 14;
const MOVEMENT_STEP_MS = 200;
const MOVEMENT_SETTLE_MS = 100;

function calcCoopAnimationDuration(maxSteps: number): number {
  return Math.max(350, maxSteps * MOVEMENT_STEP_MS + MOVEMENT_SETTLE_MS);
}

export class CoopRoom {
  readonly roomId: string;
  readonly code: string;
  private io: Server;
  private readonly createdAt = Date.now();
  private lastActivityAt = Date.now();
  private players: Map<PlayerColor, PlayerState> = new Map();
  private phase: CoopClientState["phase"] = "waiting";
  private portalWave = 1;
  private planningRound = 1;
  private portals = [] as CoopClientState["portals"];
  private enemies: CoopEnemy[] = [];
  private enemyPreviews: CoopEnemyPreview[] = [];
  private obstacles: Position[] = [];
  private timer = new ServerTimer();
  private rematchSet = new Set<string>();
  private readySockets = new Set<string>();
  private pendingStart = false;
  private finalEnemyPhase = false;
  private bossPhase = false;
  private bossRoundsRemaining = 0;
  private gameResult: CoopResult | null = null;
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

  get currentPhase(): CoopClientState["phase"] {
    return this.phase;
  }

  get createdTimestamp(): number {
    return this.createdAt;
  }

  get lastActivityTimestamp(): number {
    return this.lastActivityAt;
  }

  addPlayer(
    socket: Socket,
    nickname: string,
    userId: string | null,
    stats: { wins: number; losses: number },
    pieceSkin: PieceSkin,
  ): PlayerColor | null {
    if (this.players.size >= 2) return null;
    const color: PlayerColor = this.players.size === 0 ? "red" : "blue";
    const pos = getInitialPositions()[color];
    this.players.set(color, {
      id: userId ?? socket.id,
      userId,
      socketId: socket.id,
      nickname,
      color,
      pieceSkin,
      hp: 3,
      position: { ...pos },
      plannedPath: [],
      pathSubmitted: false,
      role: "attacker",
      stats,
    });
    socket.join(this.roomId);
    this.touchActivity();
    return color;
  }

  updatePlayerSkin(socketId: string, pieceSkin: PieceSkin): void {
    const player = this.getPlayerBySocket(socketId);
    if (!player) return;
    player.pieceSkin = pieceSkin;
    this.touchActivity();
    this.io.to(this.roomId).emit("player_skin_updated", {
      color: player.color,
      pieceSkin,
    });
  }

  removePlayer(socketId: string): void {
    for (const [color, player] of this.players.entries()) {
      if (player.socketId !== socketId) continue;
      this.players.delete(color);
      this.timer.clear();
      this.clearPlanningGraceTimeout();
      this.clearNextRoundTimeout();
      this.readySockets.clear();
      this.pendingStart = false;
      this.phase = "gameover";
      this.gameResult = "lose";
      this.touchActivity();
      return;
    }
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
    const allReady = [...this.players.values()].every((entry) =>
      this.readySockets.has(entry.socketId),
    );
    if (!allReady) return false;
    this.startGame();
    return true;
  }

  startGame(): void {
    this.pendingStart = false;
    this.readySockets.clear();
    this.portalWave = 1;
    this.planningRound = 1;
    this.phase = "planning";
    this.finalEnemyPhase = false;
    this.bossPhase = false;
    this.bossRoundsRemaining = 0;
    this.gameResult = null;
    this.rewardsGranted = false;
    this.rematchSet.clear();
    this.clearPlanningGraceTimeout();
    this.clearNextRoundTimeout();
    this.resetPlayers();
    this.enemies = [];
    this.enemyPreviews = [];
    this.obstacles = [];
    this.spawnPortalsForCurrentWave();
    this.touchActivity();
    const gameStartState = this.toClientState();
    this.io.to(this.roomId).emit("coop_game_start", gameStartState);
    this.emitRoundStart();
  }

  updatePlannedPath(socketId: string, path: Position[]): void {
    if (this.phase !== "planning") return;
    const player = this.getPlayerBySocket(socketId);
    if (!player || player.pathSubmitted) return;
    if (player.hp <= 0) return;
    if (
      !isValidCoopPath(
        player.position,
        path,
        calcCoopPathPoints(this.planningRound),
        this.obstacles,
      )
    )
      return;
    player.plannedPath = path;
    this.touchActivity();
    this.io.to(this.roomId).emit("coop_path_updated", {
      color: player.color,
      path,
    });
  }

  submitPath(socketId: string, path: Position[]): boolean {
    if (this.phase !== "planning") return false;
    const player = this.getPlayerBySocket(socketId);
    if (!player || player.pathSubmitted) return false;
    if (player.hp <= 0) return false;
    const maxPoints = calcCoopPathPoints(this.planningRound);
    player.plannedPath = isValidCoopPath(
      player.position,
      path,
      maxPoints,
      this.obstacles,
    )
      ? path
      : isValidCoopPath(
            player.position,
            player.plannedPath,
            maxPoints,
            this.obstacles,
          )
        ? player.plannedPath
        : [];
    player.pathSubmitted = true;
    this.touchActivity();
    this.io
      .to(this.roomId)
      .emit("coop_player_submitted", { color: player.color });

    if ([...this.players.values()].every((entry) => entry.pathSubmitted)) {
      this.timer.clear();
      this.resolveRound();
    }

    return true;
  }

  requestRematch(socketId: string): void {
    if (this.phase !== "gameover") return;
    if (this.rematchSet.has(socketId)) return;
    this.rematchSet.add(socketId);
    if (this.rematchSet.size === 1) {
      this.emitToOpponent(socketId, "rematch_requested", {});
      return;
    }
    this.startGame();
  }

  sendChat(socketId: string, message: string): void {
    const player = this.getPlayerBySocket(socketId);
    if (!player) return;
    this.touchActivity();
    this.io.to(this.roomId).emit("chat_receive", {
      sender: player.nickname,
      color: player.color,
      message: message.slice(0, 200),
      timestamp: Date.now(),
    });
  }

  getSocketIds(): string[] {
    return [...this.players.values()].map((player) => player.socketId);
  }

  private emitRoundStart(): void {
    if (!this.hasBothPlayers()) return;
    this.phase = "planning";
    const now = Date.now();
    this.touchActivity(now);
    const state = this.toClientState();
    const payload: CoopRoundStartPayload = {
      state,
      timeLimit: 7,
      serverTime: now,
      roundEndsAt: now + PLANNING_TIME_MS,
    };
    this.io.to(this.roomId).emit("coop_round_start", payload);
    this.timer.start(PLANNING_TIME_MS, () => this.onPlanningTimeout());
  }

  private onPlanningTimeout(): void {
    if (this.phase !== "planning") return;
    this.clearPlanningGraceTimeout();
    this.planningGraceTimeout = setTimeout(() => {
      this.planningGraceTimeout = null;
      if (this.phase !== "planning") return;
      const maxPoints = calcCoopPathPoints(this.planningRound);
      for (const player of this.players.values()) {
        if (player.pathSubmitted) continue;
        if (player.hp <= 0) {
          player.plannedPath = [];
          player.pathSubmitted = true;
          continue;
        }
        player.plannedPath = isValidCoopPath(
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
    if (!this.hasBothPlayers()) return;
    const red = this.players.get("red");
    const blue = this.players.get("blue");
    if (!red || !blue) return;

    const redStart = { ...red.position };
    const blueStart = { ...blue.position };
    const redPath = red.hp > 0 ? [...red.plannedPath] : [];
    const bluePath = blue.hp > 0 ? [...blue.plannedPath] : [];
    const enemyMoves = this.bossPhase
      ? this.buildBossMoves(redStart, blueStart, red.hp > 0, blue.hp > 0)
      : this.enemyPreviews.map((enemy) => ({
          ...enemy,
          start: { ...enemy.start },
          path: enemy.path.map((position) => ({ ...position })),
        }));

    this.phase = "moving";

    const resolution = resolveCoopMovement({
      redStart,
      blueStart,
      redPath,
      bluePath,
      enemies: enemyMoves,
      portals: this.portals,
      redHp: red.hp,
      blueHp: blue.hp,
    });

    const convertedEnemies: CoopEnemy[] = resolution.remainingPortals.map(
      (portal) => ({
        id: `${portal.id}_enemy`,
        position: { ...portal.position },
      }),
    );
    const redEnd = { ...resolution.redEnd };
    const blueEnd = { ...resolution.blueEnd };
    const nextRound = this.planningRound + 1;
    const nextPortalWave = this.portalWave + 1;
    let nextPhase: CoopClientState["phase"] = "planning";
    let nextResult: CoopResult | null = null;
    let nextFinalEnemyPhase = this.finalEnemyPhase;
    let nextBossPhase = this.bossPhase;
    let nextBossRoundsRemaining = this.bossRoundsRemaining;
    let nextEnemies: CoopEnemy[] = [];
    let nextEnemyPreviews: CoopEnemyPreview[] = [];
    let nextPortals = [] as CoopClientState["portals"];
    let nextObstacles: Position[] = this.obstacles;

    if (resolution.redHp <= 0 && resolution.blueHp <= 0) {
      nextPhase = "gameover";
      nextResult = "lose";
    } else if (this.bossPhase) {
      nextEnemies = this.enemies.map((enemy, index) => ({
        id: enemy.id,
        position:
          index === 0
            ? (enemyMoves[0]?.path[enemyMoves[0].path.length - 1] ??
              enemyMoves[0]?.start ??
              enemy.position)
            : enemy.position,
        isBoss: true,
      }));
      nextEnemyPreviews = [];
      nextBossPhase = true;
      nextBossRoundsRemaining = Math.max(0, this.bossRoundsRemaining - 1);
      if (nextBossRoundsRemaining <= 0) {
        nextPhase = "gameover";
        nextResult = "win";
        nextEnemies = [];
        nextEnemyPreviews = [];
        nextBossPhase = false;
        nextObstacles = [];
      } else {
        nextObstacles = this.generateBossObstacles(
          nextBossRoundsRemaining,
          redEnd,
          blueEnd,
          nextEnemies[0]?.position,
        );
      }
    } else if (this.getCurrentPortalCount() >= FINAL_PORTAL_COUNT) {
      if (convertedEnemies.length === 0) {
        nextBossPhase = true;
        nextBossRoundsRemaining = 5;
        nextEnemies = [this.createBoss(redEnd, blueEnd)];
        nextEnemyPreviews = [];
        nextObstacles = this.generateBossObstacles(
          nextBossRoundsRemaining,
          redEnd,
          blueEnd,
          nextEnemies[0]?.position,
        );
      } else {
        nextFinalEnemyPhase = true;
        nextEnemies = convertedEnemies;
        nextEnemyPreviews = createEnemyPreviews({
          enemies: nextEnemies,
          redPosition: redEnd,
          bluePosition: blueEnd,
          redAlive: resolution.redHp > 0,
          blueAlive: resolution.blueHp > 0,
          obstacles: [],
        });
        nextObstacles = [];
      }
    } else {
      nextEnemies = convertedEnemies;
      nextEnemyPreviews = createEnemyPreviews({
        enemies: nextEnemies,
        redPosition: redEnd,
        bluePosition: blueEnd,
        redAlive: resolution.redHp > 0,
        blueAlive: resolution.blueHp > 0,
        obstacles: [],
      });
      nextPortals = createCoopPortalBatch({
        count: Math.min(3 + nextPortalWave, FINAL_PORTAL_COUNT),
        occupied: [
          redEnd,
          blueEnd,
          ...nextEnemies.map((enemy) => enemy.position),
        ],
        idPrefix: `${this.roomId}_${nextPortalWave}`,
      });
      nextObstacles = [];
    }

    const payload: CoopResolutionPayload = {
      redPath,
      bluePath,
      redStart,
      blueStart,
      enemyMoves,
      playerHits: resolution.playerHits,
      portalHits: resolution.portalHits,
    };

    this.touchActivity();
    this.io.to(this.roomId).emit("coop_resolution", payload);

    this.clearNextRoundTimeout();
    const maxSteps = Math.max(
      redPath.length + 1,
      bluePath.length + 1,
      ...enemyMoves.map((enemy) => enemy.path.length + 1),
    );
    const animTime = calcCoopAnimationDuration(maxSteps);
    this.nextRoundTimeout = setTimeout(() => {
      this.nextRoundTimeout = null;
      if (!this.hasBothPlayers()) return;
      const liveRed = this.players.get("red");
      const liveBlue = this.players.get("blue");
      if (!liveRed || !liveBlue) return;

      liveRed.position = redEnd;
      liveBlue.position = blueEnd;
      liveRed.hp = resolution.redHp;
      liveBlue.hp = resolution.blueHp;
      liveRed.plannedPath = [];
      liveBlue.plannedPath = [];
      liveRed.pathSubmitted = false;
      liveBlue.pathSubmitted = false;

      this.portals = nextPortals;
      this.enemies = nextEnemies;
      this.enemyPreviews = nextEnemyPreviews;
      this.obstacles = nextObstacles;
      this.finalEnemyPhase = nextFinalEnemyPhase;
      this.bossPhase = nextBossPhase;
      this.bossRoundsRemaining = nextBossRoundsRemaining;
      this.gameResult = nextResult;

      if (nextPhase === "gameover") {
        this.phase = "gameover";
        this.touchActivity();
        if (nextResult === "win" && !this.rewardsGranted) {
          this.rewardsGranted = true;
          void grantDailyRewardTokens(
            [...this.players.values()].map((player) => player.userId),
            12,
          );
        }
        this.io.to(this.roomId).emit("coop_game_over", { result: nextResult });
        return;
      }

      this.portalWave = nextPortalWave;
      this.planningRound = nextRound;
      this.emitRoundStart();
    }, animTime);
  }

  private spawnPortalsForCurrentWave(): void {
    const red = this.players.get("red");
    const blue = this.players.get("blue");
    if (!red || !blue) return;
    const occupied = [
      red.position,
      blue.position,
      ...this.enemies.map((enemy) => enemy.position),
    ];
    this.portals = createCoopPortalBatch({
      count: this.getCurrentPortalCount(),
      occupied,
      idPrefix: `${this.roomId}_${this.portalWave}`,
    });
  }

  private getCurrentPortalCount(): number {
    return Math.min(3 + this.portalWave, FINAL_PORTAL_COUNT);
  }

  private hasBothPlayers(): boolean {
    return this.players.has("red") && this.players.has("blue");
  }

  private getPlayerBySocket(socketId: string): PlayerState | undefined {
    return [...this.players.values()].find(
      (player) => player.socketId === socketId,
    );
  }

  private emitToOpponent(
    socketId: string,
    event: string,
    payload: unknown,
  ): void {
    for (const player of this.players.values()) {
      if (player.socketId === socketId) continue;
      this.io.to(player.socketId).emit(event, payload);
      return;
    }
  }

  private resetPlayers(): void {
    const positions = getInitialPositions();
    for (const [color, player] of this.players.entries()) {
      player.hp = 3;
      player.position = { ...positions[color] };
      player.pathSubmitted = false;
      player.plannedPath = [];
      player.role = "attacker";
    }
  }

  private clearPlanningGraceTimeout(): void {
    if (!this.planningGraceTimeout) return;
    clearTimeout(this.planningGraceTimeout);
    this.planningGraceTimeout = null;
  }

  private clearNextRoundTimeout(): void {
    if (!this.nextRoundTimeout) return;
    clearTimeout(this.nextRoundTimeout);
    this.nextRoundTimeout = null;
  }

  private touchActivity(now = Date.now()): void {
    this.lastActivityAt = now;
  }

  toClientState(): CoopClientState {
    const red = this.players.get("red");
    const blue = this.players.get("blue");
    if (!red || !blue) {
      throw new Error(
        "Coop room requires both players before serializing state.",
      );
    }

    return {
      roomId: this.roomId,
      code: this.code,
      round: this.planningRound,
      portalSpawnCount: this.finalEnemyPhase ? 0 : this.getCurrentPortalCount(),
      phase: this.phase,
      pathPoints: calcCoopPathPoints(this.planningRound),
      obstacles: this.obstacles.map((obstacle) => ({ ...obstacle })),
      players: {
        red: toClientPlayer(red),
        blue: toClientPlayer(blue),
      },
      portals: this.portals.map((portal) => ({ ...portal })),
      enemies: this.enemies.map((enemy) => ({ ...enemy })),
      enemyPreviews: this.enemyPreviews.map((enemy) => ({
        ...enemy,
        start: { ...enemy.start },
        path: enemy.path.map((position) => ({ ...position })),
      })),
      finalWave:
        this.finalEnemyPhase ||
        this.getCurrentPortalCount() >= FINAL_PORTAL_COUNT,
      bossPhase: this.bossPhase,
      bossRoundsRemaining: this.bossRoundsRemaining,
      gameResult: this.gameResult,
    };
  }

  private buildBossMoves(
    redPosition: Position,
    bluePosition: Position,
    redAlive: boolean,
    blueAlive: boolean,
  ): CoopEnemyPreview[] {
    return this.enemies
      .filter((enemy) => enemy.isBoss)
      .map((enemy) => {
        return {
          id: enemy.id,
          start: { ...enemy.position },
          path: createCoopEnemyAttackPath({
            selfPosition: enemy.position,
            redPosition,
            bluePosition,
            redAlive,
            blueAlive,
            pathPoints: 10,
            obstacles: this.obstacles,
          }),
        };
      });
  }

  private generateBossObstacles(
    roundsRemaining: number,
    redPosition: Position,
    bluePosition: Position,
    bossPosition?: Position,
  ): Position[] {
    const count = Math.min(8, 4 + (5 - roundsRemaining));
    for (let attempt = 0; attempt < 8; attempt++) {
      const obstacles = generateObstacles(
        `${this.roomId}_boss`,
        6 - roundsRemaining + attempt,
        redPosition,
        bluePosition,
        count,
      );
      if (
        !bossPosition ||
        !obstacles.some(
          (obstacle) => this.toKey(obstacle) === this.toKey(bossPosition),
        )
      ) {
        return obstacles;
      }
    }
    return [];
  }

  private createBoss(redPosition: Position, bluePosition: Position): CoopEnemy {
    const blocked = new Set([
      this.toKey(redPosition),
      this.toKey(bluePosition),
    ]);
    const candidates: Position[] = [];

    for (let row = 0; row < 5; row++) {
      for (let col = 0; col < 5; col++) {
        const position = { row, col };
        if (blocked.has(this.toKey(position))) continue;
        candidates.push(position);
      }
    }

    const position = candidates[
      Math.floor(Math.random() * candidates.length)
    ] ?? { row: 2, col: 2 };
    return {
      id: `${this.roomId}_boss`,
      position,
      isBoss: true,
    };
  }

  private toKey(position: Position): string {
    return `${position.row},${position.col}`;
  }
}
