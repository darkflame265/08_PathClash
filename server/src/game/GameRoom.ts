import { Server, Socket } from 'socket.io';
import {
  GameState, PlayerState, PlayerColor, Position,
  ClientGameState, PathsRevealPayload, RoundStartPayload,
} from '../types/game.types';
import {
  calcPathPoints, detectCollisions, getInitialPositions,
  isValidPath, calcAnimationDuration, toClientPlayer, generateObstacles,
} from './GameEngine';
import { createAiPath } from './AiPlanner';
import { ServerTimer } from './ServerTimer';

const PLANNING_TIME_MS = 7_000;
const SUBMIT_GRACE_MS = 350;

export class GameRoom {
  readonly roomId: string;
  readonly code: string;
  private io: Server;

  private players: Map<PlayerColor, PlayerState> = new Map();
  private phase: GameState['phase'] = 'waiting';
  private turn = 1;
  private attackerColor: PlayerColor = 'red';
  private obstacles: Position[] = [];
  private timer = new ServerTimer();
  private rematchSet: Set<string> = new Set();
  private aiColor: PlayerColor | null = null;

  constructor(roomId: string, code: string, io: Server) {
    this.roomId = roomId;
    this.code = code;
    this.io = io;
  }

  get playerCount(): number { return this.players.size; }
  get isFull(): boolean { return this.players.size === 2; }

  addPlayer(socket: Socket, nickname: string): PlayerColor | null {
    if (this.isFull) return null;
    const color: PlayerColor = this.players.size === 0 ? 'red' : 'blue';
    const player = this.createPlayerState(color, socket.id, nickname);
    this.players.set(color, player);
    socket.join(this.roomId);
    return color;
  }

  addAiPlayer(nickname = 'AI Bot'): PlayerColor | null {
    if (this.isFull) return null;
    const color: PlayerColor = this.players.size === 0 ? 'red' : 'blue';
    const aiId = `ai_${this.roomId}_${color}`;
    const player = this.createPlayerState(color, aiId, nickname);
    this.players.set(color, player);
    this.aiColor = color;
    return color;
  }

  removePlayer(socketId: string): void {
    for (const [color, p] of this.players) {
      if (p.socketId === socketId) {
        this.players.delete(color);
        if (this.aiColor === color) this.aiColor = null;
        this.timer.clear();
        break;
      }
    }
  }

  hasHumanPlayers(): boolean {
    return [...this.players.values()].some((player) => player.color !== this.aiColor);
  }

  // ─── Game flow ─────────────────────────────────────────────────────────────

  startGame(): void {
    this.phase = 'planning';
    this.turn = 1;
    this.attackerColor = 'red';
    this.resetPositions();
    this.updateRoles();
    this.io.to(this.roomId).emit('game_start', this.toClientState());
    this.startRound();
  }

  private startRound(): void {
    this.phase = 'planning';
    const red = this.players.get('red')!;
    const blue = this.players.get('blue')!;
    red.plannedPath = [];
    red.pathSubmitted = false;
    blue.plannedPath = [];
    blue.pathSubmitted = false;
    this.obstacles = generateObstacles(this.roomId, this.turn, red.position, blue.position);

    const payload: RoundStartPayload = {
      turn: this.turn,
      pathPoints: calcPathPoints(this.turn),
      attackerColor: this.attackerColor,
      redPosition: red.position,
      bluePosition: blue.position,
      obstacles: this.obstacles,
      timeLimit: 7,
      serverTime: Date.now(),
    };
    this.io.to(this.roomId).emit('round_start', payload);

    this.timer.start(PLANNING_TIME_MS, () => this.onPlanningTimeout());
  }

  private onPlanningTimeout(): void {
    this.submitAiPath();

    // Give the timer-end submission a brief grace window to arrive.
    setTimeout(() => {
      if (this.phase !== 'planning') return;

      for (const [, p] of this.players) {
        if (!p.pathSubmitted) {
          const maxPoints = calcPathPoints(this.turn);
          if (!isValidPath(p.position, p.plannedPath, maxPoints, this.obstacles)) {
            p.plannedPath = [];
          }
          p.pathSubmitted = true;
        }
      }
      this.revealPaths();
    }, SUBMIT_GRACE_MS);
  }

  updatePlannedPath(socketId: string, path: Position[]): void {
    if (this.phase !== 'planning') return;
    const player = this.getPlayerBySocket(socketId);
    if (!player || player.pathSubmitted) return;

    const maxPoints = calcPathPoints(this.turn);
    if (!isValidPath(player.position, path, maxPoints, this.obstacles)) return;
    player.plannedPath = path;
  }

  submitPath(socketId: string, path: Position[]): boolean {
    if (this.phase !== 'planning') return false;
    const player = this.getPlayerBySocket(socketId);
    if (!player || player.pathSubmitted) return false;

    const maxPoints = calcPathPoints(this.turn);
    if (isValidPath(player.position, path, maxPoints, this.obstacles)) {
      // Invalid path — treat as empty
      player.plannedPath = path;
    } else if (!isValidPath(player.position, player.plannedPath, maxPoints, this.obstacles)) {
      player.plannedPath = [];
    }
    player.pathSubmitted = true;

    // Notify opponent
    this.emitToOpponent(socketId, 'opponent_submitted', {});

    // Both submitted → reveal
    const allSubmitted = [...this.players.values()].every(p => p.pathSubmitted);
    if (allSubmitted) {
      this.timer.clear();
      this.revealPaths();
    }
    return true;
  }

  private revealPaths(): void {
    if (this.phase !== 'planning') return;
    this.phase = 'moving';
    const red = this.players.get('red')!;
    const blue = this.players.get('blue')!;
    const escaper = this.attackerColor === 'red' ? blue : red;

    const collisions = detectCollisions(
      red.plannedPath, blue.plannedPath,
      red.position, blue.position,
      this.attackerColor, escaper.hp
    );

    const payload: PathsRevealPayload = {
      redPath: red.plannedPath,
      bluePath: blue.plannedPath,
      redStart: { ...red.position },
      blueStart: { ...blue.position },
      collisions,
    };
    this.io.to(this.roomId).emit('paths_reveal', payload);

    // Apply collision HP changes
    if (collisions.length > 0) {
      const lastCollision = collisions[collisions.length - 1];
      escaper.hp = lastCollision.newHp;
    }

    // Advance positions to end of paths
    if (red.plannedPath.length > 0) red.position = red.plannedPath[red.plannedPath.length - 1];
    if (blue.plannedPath.length > 0) blue.position = blue.plannedPath[blue.plannedPath.length - 1];

    // Wait for animation to finish
    const animTime = calcAnimationDuration(
      Math.max(red.plannedPath.length, blue.plannedPath.length)
    );
    setTimeout(() => this.onMovingComplete(), animTime);
  }

  private onMovingComplete(): void {
    const red = this.players.get('red')!;
    const blue = this.players.get('blue')!;

    // Check game over
    if (red.hp <= 0 || blue.hp <= 0) {
      this.phase = 'gameover';
      const winner: PlayerColor = red.hp > 0 ? 'red' : 'blue';
      const loser: PlayerColor = winner === 'red' ? 'blue' : 'red';
      this.players.get(winner)!.stats.wins++;
      this.players.get(loser)!.stats.losses++;

      this.io.to(this.roomId).emit('game_over', { winner });
      return;
    }

    // Next round
    this.turn++;
    this.attackerColor = this.attackerColor === 'red' ? 'blue' : 'red';
    this.updateRoles();

    this.io.to(this.roomId).emit('round_end', {
      redPosition: red.position,
      bluePosition: blue.position,
      newTurn: this.turn,
    });

    setTimeout(() => this.startRound(), 500);
  }

  // ─── Rematch ────────────────────────────────────────────────────────────────

  requestRematch(socketId: string): void {
    if (this.phase !== 'gameover') return;
    if (this.aiColor) {
      this.rematchSet.clear();
      this.resetGame();
      this.startGame();
      return;
    }
    if (this.rematchSet.has(socketId)) return;
    this.rematchSet.add(socketId);

    if (this.rematchSet.size === 1) {
      this.emitToOpponent(socketId, 'rematch_requested', {});
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
    this.io.to(this.roomId).emit('chat_receive', {
      sender: player.nickname,
      color: player.color,
      message: trimmed,
      timestamp: Date.now(),
    });
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private resetGame(): void {
    this.turn = 1;
    this.attackerColor = 'red';
    this.phase = 'waiting';
    this.obstacles = [];
    this.resetPositions();
    for (const p of this.players.values()) {
      p.hp = 3;
      p.plannedPath = [];
      p.pathSubmitted = false;
    }
    this.updateRoles();
  }

  private resetPositions(): void {
    const pos = getInitialPositions();
    const red = this.players.get('red');
    const blue = this.players.get('blue');
    if (red) red.position = { ...pos.red };
    if (blue) blue.position = { ...pos.blue };
  }

  private updateRoles(): void {
    for (const [color, p] of this.players) {
      p.role = color === this.attackerColor ? 'attacker' : 'escaper';
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
        red: toClientPlayer(red),
        blue: toClientPlayer(blue),
      },
      attackerColor: this.attackerColor,
    };
  }

  getPlayerColor(socketId: string): PlayerColor | undefined {
    return this.getPlayerBySocket(socketId)?.color;
  }

  private createPlayerState(color: PlayerColor, id: string, nickname: string): PlayerState {
    const pos = getInitialPositions();
    return {
      id,
      socketId: id,
      nickname,
      color,
      hp: 3,
      position: pos[color],
      plannedPath: [],
      pathSubmitted: false,
      role: color === 'red' ? 'attacker' : 'escaper',
      stats: { wins: 0, losses: 0 },
    };
  }

  private submitAiPath(): void {
    if (!this.aiColor || this.phase !== 'planning') return;
    const aiPlayer = this.players.get(this.aiColor);
    if (!aiPlayer || aiPlayer.pathSubmitted) return;

    const opponentColor: PlayerColor = this.aiColor === 'red' ? 'blue' : 'red';
    const opponent = this.players.get(opponentColor);
    if (!opponent) return;

    aiPlayer.plannedPath = createAiPath({
      color: aiPlayer.color,
      role: aiPlayer.role,
      selfPosition: aiPlayer.position,
      opponentPosition: opponent.position,
      pathPoints: calcPathPoints(this.turn),
      obstacles: this.obstacles,
    });
    aiPlayer.pathSubmitted = true;
  }
}
