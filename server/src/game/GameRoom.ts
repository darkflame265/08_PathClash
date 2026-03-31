import { Server, Socket } from "socket.io";
import {
  GameState,
  PlayerState,
  PlayerColor,
  Position,
  PieceSkin,
  ClientGameState,
  PathsRevealPayload,
  RoundStartPayload,
  MatchType,
} from "../types/game.types";
import {
  calcPathPoints,
  detectCollisions,
  getInitialPositions,
  isValidPath,
  calcAnimationDuration,
  toClientPlayer,
  generateObstacles,
} from "./GameEngine";
import { createAiPath } from "./AiPlanner";
import { ServerTimer } from "./ServerTimer";
import { recordMatchmakingResult } from "../services/playerAuth";
import {
  markTutorialComplete,
  recordMatchPlayed,
  recordModeWin,
} from "../services/achievementService";

const PLANNING_TIME_MS = 7_000;
const SUBMIT_GRACE_MS = 350;
type TutorialScenario =
  | "attack"
  | "escape"
  | "predict"
  | "predict_obstacle"
  | "predict_wall"
  | "overlap_escape"
  | "chain_attack"
  | "freeplay";

function getTutorialAttackerColor(
  scenario: TutorialScenario,
  humanColor: PlayerColor,
  aiColor: PlayerColor,
): PlayerColor {
  return scenario === "escape" || scenario === "overlap_escape"
    ? aiColor
    : humanColor;
}

export class GameRoom {
  readonly roomId: string;
  readonly code: string;
  private io: Server;
  private readonly createdAt = Date.now();
  private lastActivityAt = Date.now();

  private players: Map<PlayerColor, PlayerState> = new Map();
  private phase: GameState["phase"] = "waiting";
  private turn = 1;
  private attackerColor: PlayerColor = "red";
  private obstacles: Position[] = [];
  private timer = new ServerTimer();
  private rematchSet: Set<string> = new Set();
  private readySockets: Set<string> = new Set();
  private aiColor: PlayerColor | null = null;
  private matchType: MatchType;
  private pendingStart = false;
  private pendingStartPaused = false;
  private tutorialActive = false;
  private tutorialScenario: TutorialScenario = "attack";
  private planningGraceTimeout: ReturnType<typeof setTimeout> | null = null;
  private movingCompleteTimeout: ReturnType<typeof setTimeout> | null = null;
  private nextRoundTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(roomId: string, code: string, io: Server, matchType: MatchType) {
    this.roomId = roomId;
    this.code = code;
    this.io = io;
    this.matchType = matchType;
  }

  get playerCount(): number {
    return this.players.size;
  }
  get isFull(): boolean {
    return this.players.size === 2;
  }
  get currentPhase(): GameState["phase"] {
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
    userId: string | null = null,
    stats: { wins: number; losses: number } = { wins: 0, losses: 0 },
    pieceSkin: PieceSkin = "classic",
  ): PlayerColor | null {
    if (this.isFull) return null;
    const color: PlayerColor = this.players.size === 0 ? "red" : "blue";
    const player = this.createPlayerState(
      color,
      socket.id,
      nickname,
      userId,
      stats,
      pieceSkin,
    );
    this.players.set(color, player);
    socket.join(this.roomId);
    this.touchActivity();
    return color;
  }

  addAiPlayer(nickname = "AI Bot"): PlayerColor | null {
    if (this.isFull) return null;
    const color: PlayerColor = this.players.size === 0 ? "red" : "blue";
    const aiId = `ai_${this.roomId}_${color}`;
    const player = this.createPlayerState(
      color,
      aiId,
      nickname,
      null,
      { wins: 0, losses: 0 },
      "classic",
    );
    this.players.set(color, player);
    this.aiColor = color;
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

  removePlayer(socketId: string): {
    disconnectedColor: PlayerColor | null;
    shouldAwardDisconnectResult: boolean;
    winnerColor: PlayerColor | null;
  } {
    let disconnectedColor: PlayerColor | null = null;
    let shouldAwardDisconnectResult = false;
    let winnerColor: PlayerColor | null = null;

    for (const [color, p] of this.players) {
      if (p.socketId === socketId) {
        const wasActiveMatch =
          this.phase === "planning" || this.phase === "moving";
        disconnectedColor = color;
        this.players.delete(color);
        if (this.aiColor === color) this.aiColor = null;
        this.timer.clear();
        this.clearPendingTimeouts();
        this.readySockets.clear();
        this.pendingStart = false;
        this.pendingStartPaused = false;
        if (
          this.matchType === "random" &&
          !this.aiColor &&
          wasActiveMatch &&
          this.players.size === 1
        ) {
          winnerColor = [...this.players.keys()][0] ?? null;
          shouldAwardDisconnectResult = winnerColor !== null;
          if (winnerColor) {
            this.phase = "gameover";
          }
        }
        this.touchActivity();
        break;
      }
    }

    return {
      disconnectedColor,
      shouldAwardDisconnectResult,
      winnerColor,
    };
  }

  hasHumanPlayers(): boolean {
    return [...this.players.values()].some(
      (player) => player.color !== this.aiColor,
    );
  }

  // ─── Game flow ─────────────────────────────────────────────────────────────

  startGame(startPaused = false): void {
    this.pendingStart = false;
    this.pendingStartPaused = false;
    this.tutorialActive = startPaused && this.matchType === "ai";
    this.tutorialScenario = "attack";
    this.readySockets.clear();
    this.phase = startPaused ? "waiting" : "planning";
    this.turn = 1;
    this.attackerColor = "red";
    this.resetPositions();
    this.updateRoles();
    this.touchActivity();
    const gameStartState = this.toClientState();
    this.io.to(this.roomId).emit("game_start", gameStartState);
    if (startPaused) return;
    this.startRound();
  }

  resumeTutorial(socketId: string): void {
    if (this.matchType !== "ai") return;
    if (this.phase !== "waiting") return;
    const player = this.getPlayerBySocket(socketId);
    if (!player || player.color === this.aiColor) return;
    this.touchActivity();
    this.startRound();
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
    if (!player || player.color === this.aiColor) return false;

    this.readySockets.add(socketId);
    this.touchActivity();

    const humanSocketIds = [...this.players.values()]
      .filter((entry) => entry.color !== this.aiColor)
      .map((entry) => entry.socketId);

    const allHumansReady =
      humanSocketIds.length > 0 &&
      humanSocketIds.every((humanSocketId) =>
        this.readySockets.has(humanSocketId),
      );

    if (!allHumansReady) return false;

    this.startGame(this.pendingStartPaused);
    return true;
  }

  private startRound(): void {
    if (!this.hasBothPlayers()) return;
    this.phase = "planning";
    const red = this.players.get("red");
    const blue = this.players.get("blue");
    if (!red || !blue) return;
    if (this.tutorialActive && this.aiColor) {
      const humanColor: PlayerColor = this.aiColor === "red" ? "blue" : "red";
      const human = this.players.get(humanColor);
      const ai = this.players.get(this.aiColor);
      if (human && ai) {
        applyTutorialScenarioLayout(human, ai, this.tutorialScenario);
        this.attackerColor = getTutorialAttackerColor(
          this.tutorialScenario,
          humanColor,
          this.aiColor,
        );
        this.updateRoles();
      }
    }
    red.plannedPath = [];
    red.pathSubmitted = false;
    blue.plannedPath = [];
    blue.pathSubmitted = false;
    this.obstacles = this.tutorialActive
      ? getTutorialObstacles(this.tutorialScenario)
      : generateObstacles(this.roomId, this.turn, red.position, blue.position);

    const now = Date.now();
    this.touchActivity(now);
    const timeLimitSeconds = this.tutorialActive ? 0 : 7;
    const payload: RoundStartPayload = {
      turn: this.turn,
      pathPoints: calcPathPoints(this.turn),
      attackerColor: this.attackerColor,
      redPosition: red.position,
      bluePosition: blue.position,
      obstacles: this.obstacles,
      timeLimit: timeLimitSeconds,
      serverTime: now,
      roundEndsAt: now + (this.tutorialActive ? 0 : PLANNING_TIME_MS),
      tutorialScenario: this.tutorialActive ? this.tutorialScenario : undefined,
    };
    if (this.tutorialActive) {
      this.io.to(this.roomId).emit("game_start", this.toClientState());
    }
    this.io.to(this.roomId).emit("round_start", payload);

    if (this.tutorialActive) {
      this.submitAiPath();
      return;
    }

    this.timer.start(PLANNING_TIME_MS, () => this.onPlanningTimeout());
  }

  private onPlanningTimeout(): void {
    if (!this.hasBothPlayers()) return;
    this.touchActivity();
    this.submitAiPath();

    // Give the timer-end submission a brief grace window to arrive.
    this.clearPlanningGraceTimeout();
    this.planningGraceTimeout = setTimeout(() => {
      this.planningGraceTimeout = null;
      if (this.phase !== "planning") return;
      if (!this.hasBothPlayers()) return;

      for (const [, p] of this.players) {
        if (!p.pathSubmitted) {
          const maxPoints = calcPathPoints(this.turn);
          if (
            !isValidPath(p.position, p.plannedPath, maxPoints, this.obstacles)
          ) {
            p.plannedPath = [];
          }
          p.pathSubmitted = true;
        }
      }
      this.revealPaths();
    }, SUBMIT_GRACE_MS);
  }

  updatePlannedPath(socketId: string, path: Position[]): void {
    if (this.phase !== "planning") return;
    const player = this.getPlayerBySocket(socketId);
    if (!player || player.pathSubmitted) return;

    const maxPoints = calcPathPoints(this.turn);
    if (!isValidPath(player.position, path, maxPoints, this.obstacles)) return;
    player.plannedPath = path;
    this.touchActivity();
  }

  submitPath(socketId: string, path: Position[]): boolean {
    if (this.phase !== "planning") return false;
    const player = this.getPlayerBySocket(socketId);
    if (!player || player.pathSubmitted) return false;

    const maxPoints = calcPathPoints(this.turn);
    if (isValidPath(player.position, path, maxPoints, this.obstacles)) {
      // Invalid path — treat as empty
      player.plannedPath = path;
    } else if (
      !isValidPath(
        player.position,
        player.plannedPath,
        maxPoints,
        this.obstacles,
      )
    ) {
      player.plannedPath = [];
    }
    player.pathSubmitted = true;
    this.touchActivity();

    // Notify opponent
    this.emitToOpponent(socketId, "opponent_submitted", {});

    // Both submitted → reveal
    const allSubmitted = [...this.players.values()].every(
      (p) => p.pathSubmitted,
    );
    if (allSubmitted) {
      this.timer.clear();
      this.revealPaths();
    }
    return true;
  }

  private revealPaths(): void {
    if (this.phase !== "planning") return;
    if (!this.hasBothPlayers()) return;
    const red = this.players.get("red");
    const blue = this.players.get("blue");
    if (!red || !blue) return;
    this.phase = "moving";
    this.touchActivity();
    const escaper = this.attackerColor === "red" ? blue : red;

    const collisions = detectCollisions(
      red.plannedPath,
      blue.plannedPath,
      red.position,
      blue.position,
      this.attackerColor,
      escaper.hp,
    );

    const payload: PathsRevealPayload = {
      redPath: red.plannedPath,
      bluePath: blue.plannedPath,
      redStart: { ...red.position },
      blueStart: { ...blue.position },
      collisions,
    };
    this.io.to(this.roomId).emit("paths_reveal", payload);

    // Apply collision HP changes
    if (collisions.length > 0) {
      const lastCollision = collisions[collisions.length - 1];
      escaper.hp = lastCollision.newHp;
    }

    // Advance positions to end of paths
    if (red.plannedPath.length > 0)
      red.position = red.plannedPath[red.plannedPath.length - 1];
    if (blue.plannedPath.length > 0)
      blue.position = blue.plannedPath[blue.plannedPath.length - 1];

    // Wait for animation to finish
    const animTime = calcAnimationDuration(
      Math.max(red.plannedPath.length, blue.plannedPath.length),
    );
    this.clearMovingCompleteTimeout();
    this.movingCompleteTimeout = setTimeout(() => {
      this.movingCompleteTimeout = null;
      this.onMovingComplete();
    }, animTime);
  }

  private onMovingComplete(): void {
    if (this.phase !== "moving") return;
    if (!this.hasBothPlayers()) return;
    const red = this.players.get("red");
    const blue = this.players.get("blue");
    if (!red || !blue) return;

    if (this.tutorialActive && this.aiColor && red.hp > 0 && blue.hp > 0) {
      const humanColor: PlayerColor = this.aiColor === "red" ? "blue" : "red";
      const human = this.players.get(humanColor);
      const ai = this.players.get(this.aiColor);
      if (!human || !ai) return;

      if (this.tutorialScenario === "attack" && ai.hp < 3) {
        const initial = getInitialPositions();
        human.position = { ...initial[human.color] };
        ai.position = { ...initial[ai.color] };
        human.plannedPath = [];
        ai.plannedPath = [];
        human.pathSubmitted = false;
        ai.pathSubmitted = false;
        human.hp = 3;
        ai.hp = 3;
        this.turn = 1;
        this.attackerColor = this.aiColor;
        this.tutorialScenario = "escape";
        this.updateRoles();
        this.touchActivity();
        this.clearNextRoundTimeout();
        this.nextRoundTimeout = setTimeout(() => {
          this.nextRoundTimeout = null;
          this.startRound();
        }, 500);
        return;
      }

      if (this.tutorialScenario === "attack") {
        const initial = getInitialPositions();
        human.position = { ...initial[human.color] };
        ai.position = { ...initial[ai.color] };
        human.plannedPath = [];
        ai.plannedPath = [];
        human.pathSubmitted = false;
        ai.pathSubmitted = false;
        human.hp = 3;
        ai.hp = 3;
        this.turn = 1;
        this.attackerColor = humanColor;
        this.tutorialScenario = "attack";
        this.updateRoles();
        this.touchActivity();
        this.clearNextRoundTimeout();
        this.nextRoundTimeout = setTimeout(() => {
          this.nextRoundTimeout = null;
          this.startRound();
        }, 500);
        return;
      }

      if (this.tutorialScenario === "escape") {
        const humanWasHit = human.hp < 3;
        const initial = getInitialPositions();
        human.position = { ...initial[human.color] };
        ai.position = { ...initial[ai.color] };
        human.plannedPath = [];
        ai.plannedPath = [];
        human.pathSubmitted = false;
        ai.pathSubmitted = false;
        human.hp = 3;
        ai.hp = 3;
        if (humanWasHit) {
          this.attackerColor = this.aiColor;
          this.tutorialScenario = "escape";
        } else {
          this.attackerColor = humanColor;
          this.tutorialScenario = "predict";
        }
        this.updateRoles();
        this.touchActivity();
        this.clearNextRoundTimeout();
        this.nextRoundTimeout = setTimeout(() => {
          this.nextRoundTimeout = null;
          this.startRound();
        }, 500);
        return;
      }

      if (this.tutorialScenario === "predict") {
        const aiWasHit = ai.hp < 3;
        const initial = getInitialPositions();
        human.position = { ...initial[human.color] };
        ai.position = { ...initial[ai.color] };
        human.plannedPath = [];
        ai.plannedPath = [];
        human.pathSubmitted = false;
        ai.pathSubmitted = false;
        human.hp = 3;
        ai.hp = 3;
        this.turn = 1;
        this.attackerColor = humanColor;
        this.tutorialScenario = aiWasHit ? "predict_obstacle" : "predict";
        this.updateRoles();
        this.touchActivity();
        this.clearNextRoundTimeout();
        this.nextRoundTimeout = setTimeout(() => {
          this.nextRoundTimeout = null;
          this.startRound();
        }, 500);
        return;
      }

      if (this.tutorialScenario === "predict_obstacle") {
        const aiWasHit = ai.hp < 3;
        applyTutorialScenarioLayout(human, ai, "predict_obstacle");
        human.plannedPath = [];
        ai.plannedPath = [];
        human.pathSubmitted = false;
        ai.pathSubmitted = false;
        human.hp = 3;
        ai.hp = 3;
        this.turn = 1;
        this.attackerColor = humanColor;
        this.tutorialScenario = aiWasHit ? "predict_wall" : "predict_obstacle";
        this.updateRoles();
        this.touchActivity();
        this.clearNextRoundTimeout();
        this.nextRoundTimeout = setTimeout(() => {
          this.nextRoundTimeout = null;
          this.startRound();
        }, 500);
        return;
      }

      if (this.tutorialScenario === "predict_wall") {
        const aiWasHit = ai.hp < 3;
        applyTutorialScenarioLayout(human, ai, "predict_wall");
        human.plannedPath = [];
        ai.plannedPath = [];
        human.pathSubmitted = false;
        ai.pathSubmitted = false;
        human.hp = 3;
        ai.hp = 3;
        this.turn = 1;
        this.tutorialScenario = aiWasHit ? "overlap_escape" : "predict_wall";
        this.attackerColor = getTutorialAttackerColor(
          this.tutorialScenario,
          humanColor,
          this.aiColor,
        );
        this.updateRoles();
        this.touchActivity();
        this.clearNextRoundTimeout();
        this.nextRoundTimeout = setTimeout(() => {
          this.nextRoundTimeout = null;
          this.startRound();
        }, 500);
        return;
      }

      if (this.tutorialScenario === "overlap_escape") {
        const tookOrDealtDamage = human.hp < 3 || ai.hp < 3;
        const escapedSuccessfully = !tookOrDealtDamage;
        applyTutorialScenarioLayout(human, ai, "overlap_escape");
        human.plannedPath = [];
        ai.plannedPath = [];
        human.pathSubmitted = false;
        ai.pathSubmitted = false;
        human.hp = 3;
        ai.hp = 3;
        this.turn = 1;
        this.tutorialScenario = escapedSuccessfully ? "chain_attack" : "overlap_escape";
        this.attackerColor = getTutorialAttackerColor(
          this.tutorialScenario,
          humanColor,
          this.aiColor,
        );
        this.updateRoles();
        this.touchActivity();
        this.clearNextRoundTimeout();
        this.nextRoundTimeout = setTimeout(() => {
          this.nextRoundTimeout = null;
          this.startRound();
        }, 500);
        return;
      }

      if (this.tutorialScenario === "chain_attack") {
        const aiDiedInOneRound = ai.hp <= 0;
        applyTutorialScenarioLayout(human, ai, "chain_attack");
        human.plannedPath = [];
        ai.plannedPath = [];
        human.pathSubmitted = false;
        ai.pathSubmitted = false;
        human.hp = 3;
        ai.hp = 3;
        this.turn = 1;
        this.tutorialScenario = aiDiedInOneRound ? "freeplay" : "chain_attack";
        this.attackerColor = getTutorialAttackerColor(
          this.tutorialScenario,
          humanColor,
          this.aiColor,
        );
        this.updateRoles();
        this.touchActivity();
        this.clearNextRoundTimeout();
        this.nextRoundTimeout = setTimeout(() => {
          this.nextRoundTimeout = null;
          this.startRound();
        }, 500);
        return;
      }

      if (this.tutorialScenario === "freeplay") {
        const initial = getInitialPositions();
        human.position = { ...initial[human.color] };
        ai.position = { ...initial[ai.color] };
        human.plannedPath = [];
        ai.plannedPath = [];
        human.pathSubmitted = false;
        ai.pathSubmitted = false;
        human.hp = 3;
        this.turn = 1;
        this.attackerColor = humanColor;
        this.tutorialScenario = "freeplay";
        this.updateRoles();
        this.touchActivity();
        this.clearNextRoundTimeout();
        this.nextRoundTimeout = setTimeout(() => {
          this.nextRoundTimeout = null;
          this.startRound();
        }, 500);
        return;
      }
    }

    // Check game over
    if (red.hp <= 0 || blue.hp <= 0) {
      this.phase = "gameover";
      const winner: PlayerColor = red.hp > 0 ? "red" : "blue";
      const loser: PlayerColor = winner === "red" ? "blue" : "red";
      const winnerUserId = this.players.get(winner)?.userId ?? null;
      const loserUserId = this.players.get(loser)?.userId ?? null;
      if (this.matchType === "random" && !this.aiColor) {
        this.players.get(winner)!.stats.wins++;
        this.players.get(loser)!.stats.losses++;
        void recordMatchmakingResult(
          winnerUserId,
          loserUserId,
        );
        void recordMatchPlayed({
          userIds: [winnerUserId, loserUserId],
          matchType: "duel",
        });
        void recordModeWin({ userId: winnerUserId, mode: "duel" });
      } else if (this.matchType === "ai" && !this.tutorialActive) {
        const humanUserIds = [...this.players.values()]
          .filter((player) => player.color !== this.aiColor)
          .map((player) => player.userId);
        void recordMatchPlayed({
          userIds: humanUserIds,
          matchType: "ai",
        });
        if (winner !== this.aiColor) {
          void recordModeWin({ userId: winnerUserId, mode: "ai" });
        }
      } else if (this.matchType === "ai" && this.tutorialActive && winner !== this.aiColor) {
        void markTutorialComplete(winnerUserId);
      }

      this.touchActivity();
      this.io.to(this.roomId).emit("game_over", { winner });
      return;
    }

    // Next round
    this.turn++;
    this.attackerColor = this.attackerColor === "red" ? "blue" : "red";
    this.updateRoles();
    this.touchActivity();

    this.io.to(this.roomId).emit("round_end", {
      redPosition: red.position,
      bluePosition: blue.position,
      newTurn: this.turn,
    });

    this.clearNextRoundTimeout();
    this.nextRoundTimeout = setTimeout(() => {
      this.nextRoundTimeout = null;
      this.startRound();
    }, 500);
  }

  // ─── Rematch ────────────────────────────────────────────────────────────────

  requestRematch(socketId: string): void {
    if (this.phase !== "gameover") return;
    if (this.aiColor) {
      this.rematchSet.clear();
      this.resetGame();
      this.startGame();
      return;
    }
    if (this.rematchSet.has(socketId)) return;
    this.rematchSet.add(socketId);
    this.touchActivity();

    if (this.rematchSet.size === 1) {
      this.emitToOpponent(socketId, "rematch_requested", {});
    } else {
      // Both agreed
      this.rematchSet.clear();
      this.resetGame();
      this.startGame();
    }
  }

  // ─── Chat ────────────────────────────────────────────────────────────────────

  sendChat(socketId: string, message: string): void {
    const player = this.getPlayerBySocket(socketId);
    if (!player) return;
    const trimmed = message.slice(0, 200);
    this.touchActivity();
    this.io.to(this.roomId).emit("chat_receive", {
      sender: player.nickname,
      color: player.color,
      message: trimmed,
      timestamp: Date.now(),
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private resetGame(): void {
    this.timer.clear();
    this.clearPendingTimeouts();
    this.turn = 1;
    this.attackerColor = "red";
    this.phase = "waiting";
    this.obstacles = [];
    this.resetPositions();
    for (const p of this.players.values()) {
      p.hp = 3;
      p.plannedPath = [];
      p.pathSubmitted = false;
    }
    this.updateRoles();
    this.readySockets.clear();
    this.pendingStart = false;
    this.pendingStartPaused = false;
    this.tutorialActive = false;
    this.tutorialScenario = "attack";
  }

  private resetPositions(): void {
    const pos = getInitialPositions();
    const red = this.players.get("red");
    const blue = this.players.get("blue");
    if (red) red.position = { ...pos.red };
    if (blue) blue.position = { ...pos.blue };
  }

  private updateRoles(): void {
    for (const [color, p] of this.players) {
      p.role = color === this.attackerColor ? "attacker" : "escaper";
    }
  }

  private getPlayerBySocket(socketId: string): PlayerState | undefined {
    for (const p of this.players.values()) {
      if (p.socketId === socketId) return p;
    }
    return undefined;
  }

  private emitToOpponent(socketId: string, event: string, data: unknown): void {
    for (const p of this.players.values()) {
      if (p.socketId !== socketId) {
        if (p.color === this.aiColor) return;
        this.io.to(p.socketId).emit(event, data);
        return;
      }
    }
  }

  toClientState(): ClientGameState {
    const red = this.players.get("red")!;
    const blue = this.players.get("blue")!;
    return {
      roomId: this.roomId,
      code: this.code,
      turn: this.turn,
      phase: this.phase,
      pathPoints: calcPathPoints(this.turn),
      obstacles: this.obstacles,
      tutorialActive: this.tutorialActive,
      players: {
        red: toClientPlayer(red),
        blue: toClientPlayer(blue),
      },
      attackerColor: this.attackerColor,
    };
  }

  getPlayerColor(socketId: string): PlayerColor | undefined {
    return this.getPlayerBySocket(socketId)?.color;
  }

  getPlayerByColor(color: PlayerColor): PlayerState | undefined {
    return this.players.get(color);
  }

  getSocketIds(): string[] {
    return [...this.players.values()].map((player) => player.socketId);
  }

  private createPlayerState(
    color: PlayerColor,
    id: string,
    nickname: string,
    userId: string | null,
    stats: { wins: number; losses: number },
    pieceSkin: PieceSkin,
  ): PlayerState {
    const pos = getInitialPositions();
    return {
      id: userId ?? id,
      userId,
      socketId: id,
      nickname,
      color,
      pieceSkin,
      hp: 3,
      position: pos[color],
      plannedPath: [],
      pathSubmitted: false,
      role: color === "red" ? "attacker" : "escaper",
      stats,
    };
  }

  private submitAiPath(): void {
    if (!this.aiColor || this.phase !== "planning") return;
    const aiPlayer = this.players.get(this.aiColor);
    if (!aiPlayer || aiPlayer.pathSubmitted) return;

    const opponentColor: PlayerColor = this.aiColor === "red" ? "blue" : "red";
    const opponent = this.players.get(opponentColor);
    if (!opponent) return;

    if (this.tutorialActive) {
      if (
        this.tutorialScenario === "attack" ||
        this.tutorialScenario === "freeplay"
      ) {
        aiPlayer.plannedPath = [];
        aiPlayer.pathSubmitted = true;
        this.touchActivity();
        return;
      }

      if (this.tutorialScenario === "predict") {
        aiPlayer.plannedPath =
          aiPlayer.color === "blue"
            ? [
                {
                  row: Math.min(4, aiPlayer.position.row + 1),
                  col: aiPlayer.position.col,
                },
                {
                  row: Math.min(4, aiPlayer.position.row + 2),
                  col: aiPlayer.position.col,
                },
                {
                  row: Math.min(4, aiPlayer.position.row + 2),
                  col: Math.max(0, aiPlayer.position.col - 1),
                },
                {
                  row: Math.min(4, aiPlayer.position.row + 2),
                  col: Math.max(0, aiPlayer.position.col - 2),
                },
              ]
            : [
                {
                  row: Math.min(4, aiPlayer.position.row + 1),
                  col: aiPlayer.position.col,
                },
                {
                  row: Math.min(4, aiPlayer.position.row + 2),
                  col: aiPlayer.position.col,
                },
                {
                  row: Math.min(4, aiPlayer.position.row + 2),
                  col: Math.min(4, aiPlayer.position.col + 1),
                },
                {
                  row: Math.min(4, aiPlayer.position.row + 2),
                  col: Math.min(4, aiPlayer.position.col + 2),
                },
              ];
        aiPlayer.pathSubmitted = true;
        this.touchActivity();
        return;
      }

      if (this.tutorialScenario === "predict_obstacle") {
        aiPlayer.plannedPath =
          aiPlayer.color === "blue"
            ? [
                {
                  row: aiPlayer.position.row,
                  col: Math.max(0, aiPlayer.position.col - 1),
                },
                {
                  row: aiPlayer.position.row,
                  col: Math.max(0, aiPlayer.position.col - 2),
                },
                {
                  row: Math.min(4, aiPlayer.position.row + 1),
                  col: Math.max(0, aiPlayer.position.col - 2),
                },
                {
                  row: Math.min(4, aiPlayer.position.row + 2),
                  col: Math.max(0, aiPlayer.position.col - 2),
                },
              ]
            : [
                {
                  row: aiPlayer.position.row,
                  col: Math.min(4, aiPlayer.position.col + 1),
                },
                {
                  row: aiPlayer.position.row,
                  col: Math.min(4, aiPlayer.position.col + 2),
                },
                {
                  row: Math.min(4, aiPlayer.position.row + 1),
                  col: Math.min(4, aiPlayer.position.col + 2),
                },
                {
                  row: Math.min(4, aiPlayer.position.row + 2),
                  col: Math.min(4, aiPlayer.position.col + 2),
                },
              ];
        aiPlayer.pathSubmitted = true;
        this.touchActivity();
        return;
      }

      if (this.tutorialScenario === "predict_wall") {
        aiPlayer.plannedPath =
          aiPlayer.color === "blue"
            ? [
                {
                  row: Math.min(4, aiPlayer.position.row + 1),
                  col: aiPlayer.position.col,
                },
                {
                  row: Math.min(4, aiPlayer.position.row + 2),
                  col: aiPlayer.position.col,
                },
              ]
            : [
                {
                  row: Math.min(4, aiPlayer.position.row + 1),
                  col: aiPlayer.position.col,
                },
                {
                  row: Math.min(4, aiPlayer.position.row + 2),
                  col: aiPlayer.position.col,
                },
              ];
        aiPlayer.pathSubmitted = true;
        this.touchActivity();
        return;
      }

      if (this.tutorialScenario === "overlap_escape") {
        aiPlayer.plannedPath =
          aiPlayer.color === "blue"
            ? [
                {
                  row: aiPlayer.position.row,
                  col: Math.max(0, aiPlayer.position.col - 1),
                },
              ]
            : [
                {
                  row: aiPlayer.position.row,
                  col: Math.min(4, aiPlayer.position.col + 1),
                },
              ];
        aiPlayer.pathSubmitted = true;
        this.touchActivity();
        return;
      }

      if (this.tutorialScenario === "chain_attack") {
        aiPlayer.plannedPath =
          aiPlayer.color === "blue"
            ? [
                { row: aiPlayer.position.row, col: Math.max(0, aiPlayer.position.col - 1) },
                { row: aiPlayer.position.row, col: Math.max(0, aiPlayer.position.col - 2) },
                { row: Math.min(4, aiPlayer.position.row + 1), col: Math.max(0, aiPlayer.position.col - 2) },
                { row: Math.min(4, aiPlayer.position.row + 1), col: Math.max(0, aiPlayer.position.col - 3) },
                { row: Math.min(4, aiPlayer.position.row + 2), col: Math.max(0, aiPlayer.position.col - 3) },
              ]
            : [
                { row: aiPlayer.position.row, col: Math.min(4, aiPlayer.position.col + 1) },
                { row: aiPlayer.position.row, col: Math.min(4, aiPlayer.position.col + 2) },
                { row: Math.min(4, aiPlayer.position.row + 1), col: Math.min(4, aiPlayer.position.col + 2) },
                { row: Math.min(4, aiPlayer.position.row + 1), col: Math.min(4, aiPlayer.position.col + 3) },
                { row: Math.min(4, aiPlayer.position.row + 2), col: Math.min(4, aiPlayer.position.col + 3) },
              ];
        aiPlayer.pathSubmitted = true;
        this.touchActivity();
        return;
      }

      const initial = getInitialPositions();
      const escapeTarget = initial[opponentColor];
      aiPlayer.plannedPath = buildTutorialAiPath(
        aiPlayer.position,
        escapeTarget,
      );
      aiPlayer.pathSubmitted = true;
      this.touchActivity();
      return;
    }

    aiPlayer.plannedPath = createAiPath({
      color: aiPlayer.color,
      role: aiPlayer.role,
      selfPosition: aiPlayer.position,
      opponentPosition: opponent.position,
      pathPoints: calcPathPoints(this.turn),
      obstacles: this.obstacles,
    });
    aiPlayer.pathSubmitted = true;
    this.touchActivity();
  }

  private touchActivity(timestamp = Date.now()): void {
    this.lastActivityAt = timestamp;
  }

  private hasBothPlayers(): boolean {
    return this.players.has("red") && this.players.has("blue");
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

function buildTutorialAiPath(start: Position, end: Position): Position[] {
  const path: Position[] = [];
  let row = start.row;
  let col = start.col;

  while (row !== end.row) {
    row += row < end.row ? 1 : -1;
    path.push({ row, col });
  }
  while (col !== end.col) {
    col += col < end.col ? 1 : -1;
    path.push({ row, col });
  }

  return path;
}

function getTutorialObstacles(scenario: TutorialScenario): Position[] {
  if (scenario === "predict_obstacle") {
    return [{ row: 1, col: 3 }];
  }
  if (scenario === "predict_wall") {
    return [
      { row: 3, col: 3 },
      { row: 4, col: 3 },
    ];
  }
  if (scenario === "overlap_escape") {
    return [
      { row: 2, col: 4 },
      { row: 3, col: 3 },
      { row: 4, col: 2 },
    ];
  }
  if (scenario === "chain_attack") {
    return [];
  }
  return [];
}

function applyTutorialScenarioLayout(
  human: PlayerState,
  ai: PlayerState,
  scenario: TutorialScenario,
): void {
  const initial = getInitialPositions();
  if (scenario === "predict_obstacle") {
    human.position = { row: 2, col: 2 };
    ai.position = ai.color === "blue" ? { row: 0, col: 4 } : { row: 0, col: 0 };
    return;
  }
  if (scenario === "predict_wall") {
    human.position = { row: 2, col: 2 };
    ai.position = ai.color === "blue" ? { row: 2, col: 4 } : { row: 2, col: 0 };
    return;
  }
  if (scenario === "overlap_escape") {
    human.position =
      ai.color === "blue" ? { row: 4, col: 4 } : { row: 4, col: 0 };
    ai.position = { ...human.position };
    return;
  }
  if (scenario === "chain_attack") {
    if (ai.color === "blue") {
      human.position = { row: 1, col: 3 };
      ai.position = { row: 0, col: 4 };
    } else {
      human.position = { row: 1, col: 1 };
      ai.position = { row: 0, col: 0 };
    }
    return;
  }

  human.position = { ...initial[human.color] };
  ai.position = { ...initial[ai.color] };
}
