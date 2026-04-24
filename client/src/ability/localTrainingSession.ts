import { resolveAbilityRound } from "./AbilityEngine";
import { isBlockedCell, isValidMove } from "../utils/pathUtils";
import type {
  BoardSkin,
  PieceSkin,
  PlayerColor,
  Position,
} from "../types/game.types";
import {
  ABILITY_SKILL_COSTS,
  ABILITY_SKILL_SERVER_RULES,
  type AbilityBattleState,
  type AbilityLavaTile,
  type AbilityPlayerState,
  type AbilityResolutionPayload,
  type AbilityRoundStartPayload,
  type AbilitySkillId,
  type AbilitySkillReservation,
  type AbilityTrapTile,
} from "../types/ability.types";

const PLANNING_TIME_MS = 9_000;
const TRAINING_STARTING_MANA = 10;
const MAX_MANA = 10;
const MANA_PER_TURN = 2;
const ABILITY_STARTING_HP = 5;
const TRAINING_PATH_POINTS = 10;
const TRAINING_DUMMY_POSITION: Position = { row: 2, col: 2 };
const NEXT_ROUND_DELAY_MS = 500;
const SKILL_EVENT_BUFFER_MS = 1_100;
const AT_FIELD_END_DELAY_MS = 700;
const TIME_REWIND_FREEZE_MS = 600;
const TIME_REWIND_HP_STEP_MS = 120;

type TrainingSocketEvent =
  | "ability_room_joined"
  | "ability_training_skill_select"
  | "ability_game_start"
  | "ability_round_start"
  | "ability_player_submitted"
  | "ability_resolution"
  | "ability_game_over";

type TrainingSocket = {
  on: (event: string, listener: (...args: never[]) => void) => void;
  off: (event: string, listener?: (...args: never[]) => void) => void;
  emit: (event: string, payload?: unknown, ack?: (response: unknown) => void) => void;
};

type Listener = (...args: never[]) => void;

type TrainingPlayerState = AbilityPlayerState & {
  isBot: boolean;
  plannedPath: Position[];
  plannedSkills: AbilitySkillReservation[];
  pendingManaBonus: number;
  pendingOverdriveStage: number;
  pendingVoidCloak: boolean;
  turnHistory: Array<{ turn: number; position: Position; hp: number }>;
};

type StartOptions = {
  nickname: string;
  pieceSkin: PieceSkin;
  boardSkin: BoardSkin;
};

const listeners = new Map<string, Set<Listener>>();

let active = false;
let clientAttached = false;
let phase: AbilityBattleState["phase"] = "waiting";
let turn = 1;
let attackerColor: PlayerColor = "red";
let roomId = "local_training";
let code = "local_training";
let obstacles: Position[] = [];
let lavaTiles: AbilityLavaTile[] = [];
let trapTiles: AbilityTrapTile[] = [];
let roundEndsAt = 0;
let planningTimeout: number | null = null;
let nextRoundTimeout: number | null = null;
let resolutionTimeout: number | null = null;
let trainingSkillSelectionPending = false;

let redPlayer: TrainingPlayerState | null = null;
let bluePlayer: TrainingPlayerState | null = null;

function getInitialPositions(): { red: Position; blue: Position } {
  return {
    red: { row: 2, col: 0 },
    blue: { row: 2, col: 4 },
  };
}

function calcAnimationDuration(pathLength: number): number {
  return pathLength * 200 + 300;
}

function createSeededRandom(seed: string): () => number {
  let hash = 2_166_136_261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }
  return () => {
    hash += hash << 13;
    hash ^= hash >>> 7;
    hash += hash << 3;
    hash ^= hash >>> 17;
    hash += hash << 5;
    return ((hash >>> 0) % 10_000) / 10_000;
  };
}

function toKey(position: Position): string {
  return `${position.row},${position.col}`;
}

function countOpenDirections(position: Position, nextObstacles: Position[]): number {
  let count = 0;
  for (const candidate of [
    { row: position.row - 1, col: position.col },
    { row: position.row + 1, col: position.col },
    { row: position.row, col: position.col - 1 },
    { row: position.row, col: position.col + 1 },
  ]) {
    if (candidate.row < 0 || candidate.row > 4 || candidate.col < 0 || candidate.col > 4) {
      continue;
    }
    if (isBlockedCell(candidate, nextObstacles)) continue;
    count += 1;
  }
  return count;
}

function generateObstaclesForTraining(
  matchId: string,
  nextTurn: number,
  redPosition: Position,
  bluePosition: Position,
): Position[] {
  const occupied = new Set([toKey(redPosition), toKey(bluePosition)]);
  const candidates: Position[] = [];
  for (let row = 0; row < 5; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      const cell = { row, col };
      if (occupied.has(toKey(cell))) continue;
      candidates.push(cell);
    }
  }

  const random = createSeededRandom(`${matchId}:${nextTurn}`);
  const shuffled = [...candidates];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  const picked: Position[] = [];
  for (const candidate of shuffled) {
    const next = [...picked, candidate];
    if (
      countOpenDirections(redPosition, next) >= 2 &&
      countOpenDirections(bluePosition, next) >= 2
    ) {
      picked.push(candidate);
    }
    if (picked.length === 4) break;
  }

  return picked;
}

function emit(event: TrainingSocketEvent, payload?: unknown): void {
  const eventListeners = listeners.get(event);
  if (!eventListeners) return;
  for (const listener of [...eventListeners]) {
    listener(payload as never);
  }
}

function clearTimers(): void {
  if (planningTimeout !== null) {
    window.clearTimeout(planningTimeout);
    planningTimeout = null;
  }
  if (nextRoundTimeout !== null) {
    window.clearTimeout(nextRoundTimeout);
    nextRoundTimeout = null;
  }
  if (resolutionTimeout !== null) {
    window.clearTimeout(resolutionTimeout);
    resolutionTimeout = null;
  }
}

function toClientState(): AbilityBattleState {
  if (!redPlayer || !bluePlayer) {
    throw new Error("training session not initialized");
  }

  return {
    roomId,
    code,
    turn,
    phase,
    pathPoints: TRAINING_PATH_POINTS,
    obstacles,
    lavaTiles,
    trapTiles: trapTiles.filter((tile) => tile.owner === "red"),
    players: {
      red: {
        id: redPlayer.id,
        nickname: redPlayer.nickname,
        color: "red",
        connected: true,
        pieceSkin: redPlayer.pieceSkin,
        boardSkin: redPlayer.boardSkin,
        hp: redPlayer.hp,
        position: redPlayer.position,
        pathSubmitted: redPlayer.pathSubmitted,
        role: redPlayer.role,
        stats: redPlayer.stats,
        mana: redPlayer.mana,
        invulnerableSteps: redPlayer.invulnerableSteps,
        overdriveActive: redPlayer.overdriveActive,
        reboundLocked: redPlayer.reboundLocked,
        hidden: redPlayer.hidden,
        previousTurnStart: redPlayer.previousTurnStart,
        previousTurnPath: redPlayer.previousTurnPath,
        equippedSkills: redPlayer.equippedSkills,
        timeRewindUsed: redPlayer.timeRewindUsed,
      },
      blue: {
        id: bluePlayer.id,
        nickname: bluePlayer.nickname,
        color: "blue",
        connected: true,
        pieceSkin: bluePlayer.pieceSkin,
        boardSkin: bluePlayer.boardSkin,
        hp: bluePlayer.hp,
        position: bluePlayer.position,
        pathSubmitted: bluePlayer.pathSubmitted,
        role: bluePlayer.role,
        stats: bluePlayer.stats,
        mana: bluePlayer.mana,
        invulnerableSteps: bluePlayer.invulnerableSteps,
        overdriveActive: bluePlayer.overdriveActive,
        reboundLocked: bluePlayer.reboundLocked,
        hidden: bluePlayer.hidden,
        previousTurnStart: bluePlayer.previousTurnStart,
        previousTurnPath: bluePlayer.previousTurnPath,
        equippedSkills: bluePlayer.equippedSkills,
        timeRewindUsed: bluePlayer.timeRewindUsed,
      },
    },
    attackerColor,
  };
}

function recordTurnSnapshot(player: TrainingPlayerState): void {
  const existingIndex = player.turnHistory.findIndex(
    (snapshot) => snapshot.turn === turn,
  );
  const nextSnapshot = {
    turn,
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

function getTimeRewindSnapshot(player: TrainingPlayerState) {
  if (player.turnHistory.length === 0) return null;
  return player.turnHistory[player.turnHistory.length - 1] ?? null;
}

function findLethalStep(
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
    if (lethalDamage) {
      lethalStep = event.step;
    }
  }
  return lethalStep;
}

function applyTimeRewindIfNeeded(
  color: PlayerColor,
  player: TrainingPlayerState,
  resolution: ReturnType<typeof resolveAbilityRound>,
): void {
  const nextState = color === "red" ? resolution.redState : resolution.blueState;
  if (nextState.hp > 0) return;
  if (player.timeRewindUsed) return;
  if (!player.equippedSkills.includes("chronos_time_rewind")) return;

  const rewindSnapshot = getTimeRewindSnapshot(player);
  if (!rewindSnapshot) return;
  const lethalStep = findLethalStep(color, resolution.payload);
  if (lethalStep === null) return;

  player.timeRewindUsed = true;
  const path = color === "red" ? resolution.payload.redPath : resolution.payload.bluePath;
  const turnStart =
    color === "red" ? resolution.payload.redStart : resolution.payload.blueStart;
  const finalStep = Math.max(
    resolution.payload.redPath.length,
    resolution.payload.bluePath.length,
  );
  const rewindFrom =
    path.length > 0 ? { ...path[path.length - 1] } : { ...turnStart };

  resolution.payload.skillEvents.push({
    step: finalStep,
    order: 999,
    color,
    skillId: "chronos_time_rewind",
    from: rewindFrom,
    to: { ...rewindSnapshot.position },
    affectedPositions: [...path].reverse().map((position) => ({ ...position })),
    rewindHp: rewindSnapshot.hp,
  });

  nextState.position = { ...rewindSnapshot.position };
  nextState.hp = rewindSnapshot.hp;

  const redHp = resolution.redState.hp;
  const blueHp = resolution.blueState.hp;
  resolution.winner =
    redHp <= 0 && blueHp <= 0
      ? "draw"
      : redHp <= 0
        ? "blue"
        : blueHp <= 0
          ? "red"
          : null;
}

function sanitizeSkills(player: TrainingPlayerState, skills: AbilitySkillReservation[]) {
  const deduped = Array.from(
    new Map(skills.map((skill) => [skill.skillId, { ...skill, target: skill.target ?? null }])).values(),
  ).slice(0, 3);
  const pathLength = player.plannedPath.length;
  const manaCost = deduped.reduce(
    (sum, skill) => sum + ABILITY_SKILL_COSTS[skill.skillId],
    0,
  );
  if (manaCost > player.mana) return [] as AbilitySkillReservation[];

  return deduped.filter((skill) => {
    const rule = ABILITY_SKILL_SERVER_RULES[skill.skillId];
    if (rule.roleRestriction === "attacker" && player.role !== "attacker") {
      return false;
    }
    if (rule.roleRestriction === "escaper" && player.role !== "escaper") {
      return false;
    }
    if (skill.step < 0 || skill.step > pathLength) return false;
    if (rule.stepRule === "zero_only" && skill.step !== 0) return false;
    if (rule.maxStep !== undefined && skill.step > rule.maxStep) return false;
    if (rule.requiresEmptyPathWhenNotOverdrive && pathLength > 0) return false;
    if (rule.requiresPreviousTurnPath && (!player.previousTurnStart || player.previousTurnPath.length === 0)) {
      return false;
    }
    if (rule.targetRule === "position") {
      if (!skill.target) return false;
      if (
        skill.target.row < 0 ||
        skill.target.row > 4 ||
        skill.target.col < 0 ||
        skill.target.col > 4
      ) {
        return false;
      }
    }
    return true;
  });
}

function sanitizePath(path: Position[]): Position[] {
  if (!redPlayer) return [];
  const result: Position[] = [];
  let current = redPlayer.position;
  for (const position of path.slice(0, TRAINING_PATH_POINTS)) {
    if (isBlockedCell(position, obstacles)) break;
    if (!isValidMove(current, position)) break;
    result.push(position);
    current = position;
  }
  return result;
}

function startRound(): void {
  if (!redPlayer || !bluePlayer) return;

  phase = "planning";
  redPlayer.pathSubmitted = false;
  bluePlayer.pathSubmitted = true;
  redPlayer.plannedPath = [];
  bluePlayer.plannedPath = [];
  redPlayer.plannedSkills = [];
  bluePlayer.plannedSkills = [];
  redPlayer.hidden = false;
  bluePlayer.hidden = false;
  redPlayer.overdriveActive = false;
  bluePlayer.overdriveActive = false;
  redPlayer.reboundLocked = false;
  bluePlayer.reboundLocked = false;
  redPlayer.mana = Math.min(MAX_MANA, redPlayer.mana + MANA_PER_TURN + redPlayer.pendingManaBonus);
  bluePlayer.mana = Math.min(MAX_MANA, bluePlayer.mana + MANA_PER_TURN + bluePlayer.pendingManaBonus);
  redPlayer.pendingManaBonus = 0;
  bluePlayer.pendingManaBonus = 0;
  if (redPlayer.pendingVoidCloak) {
    redPlayer.hidden = true;
    redPlayer.pendingVoidCloak = false;
  }
  if (bluePlayer.pendingVoidCloak) {
    bluePlayer.hidden = true;
    bluePlayer.pendingVoidCloak = false;
  }

  obstacles = generateObstaclesForTraining(roomId, turn, redPlayer.position, bluePlayer.position);
  recordTurnSnapshot(redPlayer);
  recordTurnSnapshot(bluePlayer);
  roundEndsAt = Date.now() + PLANNING_TIME_MS;

  emit("ability_round_start", {
    timeLimit: PLANNING_TIME_MS / 1000,
    roundEndsAt,
    state: toClientState(),
  } satisfies AbilityRoundStartPayload);

  planningTimeout = window.setTimeout(() => {
    planningTimeout = null;
    revealPlans();
  }, PLANNING_TIME_MS);
}

function onMovingComplete(winner: PlayerColor | "draw" | null): void {
  if (!redPlayer || !bluePlayer) return;
  if (winner) {
    phase = "gameover";
    emit("ability_game_over", { winner });
    return;
  }

  redPlayer.invulnerableSteps = 0;
  bluePlayer.invulnerableSteps = 0;
  turn += 1;
  attackerColor = attackerColor === "red" ? "blue" : "red";
  redPlayer.role = attackerColor === "red" ? "attacker" : "escaper";
  bluePlayer.role = attackerColor === "blue" ? "attacker" : "escaper";
  nextRoundTimeout = window.setTimeout(() => {
    nextRoundTimeout = null;
    startRound();
  }, NEXT_ROUND_DELAY_MS);
}

function revealPlans(): void {
  if (!redPlayer || !bluePlayer || phase !== "planning") return;
  phase = "moving";
  redPlayer.hidden = false;
  bluePlayer.hidden = false;

  const resolution = resolveAbilityRound({
    red: redPlayer,
    blue: bluePlayer,
    attackerColor,
    obstacles,
    lavaTiles,
    trapTiles,
  });

  applyTimeRewindIfNeeded("red", redPlayer, resolution);
  applyTimeRewindIfNeeded("blue", bluePlayer, resolution);

  redPlayer.previousTurnStart = { ...resolution.payload.redStart };
  redPlayer.previousTurnPath = resolution.payload.redPath.map((position) => ({ ...position }));
  bluePlayer.previousTurnStart = { ...resolution.payload.blueStart };
  bluePlayer.previousTurnPath = resolution.payload.bluePath.map((position) => ({ ...position }));

  redPlayer.position = resolution.redState.position;
  redPlayer.hp = resolution.redState.hp;
  redPlayer.mana = resolution.redState.mana;
  redPlayer.invulnerableSteps = resolution.redState.invulnerableSteps;
  redPlayer.pendingManaBonus = resolution.redState.pendingManaBonus ?? 0;
  redPlayer.pendingOverdriveStage = resolution.redState.pendingOverdriveStage ?? 0;
  redPlayer.pendingVoidCloak = resolution.redState.pendingVoidCloak ?? false;
  redPlayer.overdriveActive = resolution.redState.overdriveActive;
  redPlayer.reboundLocked = resolution.redState.reboundLocked;

  bluePlayer.position = resolution.blueState.position;
  bluePlayer.hp = resolution.blueState.hp;
  bluePlayer.mana = resolution.blueState.mana;
  bluePlayer.invulnerableSteps = resolution.blueState.invulnerableSteps;
  bluePlayer.pendingManaBonus = resolution.blueState.pendingManaBonus ?? 0;
  bluePlayer.pendingOverdriveStage = resolution.blueState.pendingOverdriveStage ?? 0;
  bluePlayer.pendingVoidCloak = resolution.blueState.pendingVoidCloak ?? false;
  bluePlayer.overdriveActive = resolution.blueState.overdriveActive;
  bluePlayer.reboundLocked = resolution.blueState.reboundLocked;

  lavaTiles = resolution.lavaTiles;
  trapTiles = resolution.trapTiles;

  emit("ability_resolution", {
    ...resolution.payload,
    trapTiles: trapTiles.filter((tile) => tile.owner === "red"),
  });

  const atFieldEventCount = resolution.payload.skillEvents.filter(
    (event) => event.skillId === "arc_reactor_field",
  ).length;
  const timeRewindExtraDelayMs = resolution.payload.skillEvents
    .filter((event) => event.skillId === "chronos_time_rewind")
    .reduce((sum, event) => {
      const rewindTicks = Math.max(
        event.affectedPositions?.length ?? 0,
        event.rewindHp ?? 0,
      );
      const rewindDuration =
        TIME_REWIND_FREEZE_MS + rewindTicks * TIME_REWIND_HP_STEP_MS + 40;
      return sum + Math.max(0, rewindDuration - SKILL_EVENT_BUFFER_MS);
    }, 0);

  const animationTime =
    calcAnimationDuration(
      Math.max(
        resolution.payload.redPath.length,
        resolution.payload.bluePath.length,
      ) + resolution.payload.skillEvents.length,
    ) +
    resolution.payload.skillEvents.length * SKILL_EVENT_BUFFER_MS +
    atFieldEventCount * AT_FIELD_END_DELAY_MS +
    timeRewindExtraDelayMs;

  resolutionTimeout = window.setTimeout(() => {
    resolutionTimeout = null;
    onMovingComplete(resolution.winner);
  }, animationTime);
}

function startGame(): void {
  if (!redPlayer || !bluePlayer) return;
  clearTimers();
  phase = "planning";
  turn = 1;
  attackerColor = "red";
  obstacles = [];
  lavaTiles = [];
  trapTiles = [];
  const initial = getInitialPositions();
  redPlayer.hp = ABILITY_STARTING_HP;
  redPlayer.position = { ...initial.red };
  redPlayer.plannedPath = [];
  redPlayer.previousTurnStart = null;
  redPlayer.previousTurnPath = [];
  redPlayer.plannedSkills = [];
  redPlayer.pathSubmitted = false;
  redPlayer.role = "attacker";
  redPlayer.mana = TRAINING_STARTING_MANA;
  redPlayer.invulnerableSteps = 0;
  redPlayer.pendingManaBonus = 0;
  redPlayer.pendingOverdriveStage = 0;
  redPlayer.pendingVoidCloak = false;
  redPlayer.overdriveActive = false;
  redPlayer.reboundLocked = false;
  redPlayer.hidden = false;
  redPlayer.timeRewindUsed = false;
  redPlayer.turnHistory = [];

  bluePlayer.hp = ABILITY_STARTING_HP;
  bluePlayer.position = { ...TRAINING_DUMMY_POSITION };
  bluePlayer.plannedPath = [];
  bluePlayer.previousTurnStart = null;
  bluePlayer.previousTurnPath = [];
  bluePlayer.plannedSkills = [];
  bluePlayer.pathSubmitted = true;
  bluePlayer.role = "escaper";
  bluePlayer.mana = TRAINING_STARTING_MANA;
  bluePlayer.invulnerableSteps = 0;
  bluePlayer.pendingManaBonus = 0;
  bluePlayer.pendingOverdriveStage = 0;
  bluePlayer.pendingVoidCloak = false;
  bluePlayer.overdriveActive = false;
  bluePlayer.reboundLocked = false;
  bluePlayer.hidden = false;
  bluePlayer.timeRewindUsed = false;
  bluePlayer.turnHistory = [];

  emit("ability_game_start", toClientState());
  startRound();
}

function confirmTrainingSkills(skills: AbilitySkillId[]): void {
  if (!redPlayer) return;
  const validSkillIds = new Set(Object.keys(ABILITY_SKILL_COSTS));
  redPlayer.equippedSkills = skills
    .filter((skillId): skillId is AbilitySkillId => validSkillIds.has(skillId))
    .slice(0, 3);
  trainingSkillSelectionPending = false;
  startGame();
}

function submitPlan(
  payload: { path?: Position[]; skills?: AbilitySkillReservation[] } | undefined,
  ack?: (response: {
    ok: boolean;
    acceptedPath: Position[];
    acceptedSkills: AbilitySkillReservation[];
  }) => void,
): void {
  if (!redPlayer || phase !== "planning" || redPlayer.pathSubmitted) {
    ack?.({ ok: false, acceptedPath: [], acceptedSkills: [] });
    return;
  }

  redPlayer.plannedPath = sanitizePath(payload?.path ?? []);
  redPlayer.plannedSkills = sanitizeSkills(redPlayer, payload?.skills ?? []);
  redPlayer.pathSubmitted = true;

  emit("ability_player_submitted", {
    color: "red",
    path: redPlayer.plannedPath,
    skills: redPlayer.plannedSkills,
  });

  ack?.({
    ok: true,
    acceptedPath: redPlayer.plannedPath,
    acceptedSkills: redPlayer.plannedSkills,
  });

  revealPlans();
}

const trainingSocket: TrainingSocket = {
  on(event, listener) {
    const nextListeners = listeners.get(event) ?? new Set<Listener>();
    nextListeners.add(listener as Listener);
    listeners.set(event, nextListeners);
  },
  off(event, listener) {
    if (!listener) {
      listeners.delete(event);
      return;
    }
    const eventListeners = listeners.get(event);
    if (!eventListeners) return;
    eventListeners.delete(listener as Listener);
    if (eventListeners.size === 0) {
      listeners.delete(event);
    }
  },
  emit(event, payload, ack) {
    if (!active) {
      if (typeof ack === "function") {
        ack({ ok: false, acceptedPath: [], acceptedSkills: [] });
      }
      return;
    }

    switch (event) {
      case "ability_client_ready":
        if (trainingSkillSelectionPending) {
          emit("ability_training_skill_select");
        }
        return;
      case "training_skills_confirmed":
        confirmTrainingSkills((payload as { skills?: AbilitySkillId[] } | undefined)?.skills ?? []);
        return;
      case "ability_submit_plan":
        submitPlan(
          payload as { path?: Position[]; skills?: AbilitySkillReservation[] } | undefined,
          ack as
            | ((response: {
                ok: boolean;
                acceptedPath: Position[];
                acceptedSkills: AbilitySkillReservation[];
              }) => void)
            | undefined,
        );
        return;
      case "request_rematch":
        if (phase === "gameover") {
          startGame();
        }
        return;
      default:
        return;
    }
  },
};

export function startLocalAbilityTraining(options: StartOptions): void {
  stopLocalAbilityTraining();
  active = true;
  clientAttached = false;
  roomId = `local_training_${Date.now().toString(36)}`;
  code = roomId;
  phase = "waiting";
  turn = 1;
  attackerColor = "red";
  obstacles = [];
  lavaTiles = [];
  trapTiles = [];
  trainingSkillSelectionPending = true;

  redPlayer = {
    id: "local-training-player",
    nickname: options.nickname,
    color: "red",
    connected: true,
    pieceSkin: options.pieceSkin,
    boardSkin: options.boardSkin,
    hp: ABILITY_STARTING_HP,
    position: { row: 2, col: 0 },
    pathSubmitted: false,
    role: "attacker",
    stats: { wins: 0, losses: 0 },
    mana: TRAINING_STARTING_MANA,
    invulnerableSteps: 0,
    overdriveActive: false,
    reboundLocked: false,
    hidden: false,
    previousTurnStart: null,
    previousTurnPath: [],
    equippedSkills: [],
    timeRewindUsed: false,
    isBot: false,
    plannedPath: [],
    plannedSkills: [],
    pendingManaBonus: 0,
    pendingOverdriveStage: 0,
    pendingVoidCloak: false,
    turnHistory: [],
  };

  bluePlayer = {
    id: "local-training-dummy",
    nickname: "Training Dummy",
    color: "blue",
    connected: true,
    pieceSkin: "classic",
    boardSkin: "classic",
    hp: ABILITY_STARTING_HP,
    position: { ...TRAINING_DUMMY_POSITION },
    pathSubmitted: true,
    role: "escaper",
    stats: { wins: 0, losses: 0 },
    mana: TRAINING_STARTING_MANA,
    invulnerableSteps: 0,
    overdriveActive: false,
    reboundLocked: false,
    hidden: false,
    previousTurnStart: null,
    previousTurnPath: [],
    equippedSkills: [],
    timeRewindUsed: false,
    isBot: true,
    plannedPath: [],
    plannedSkills: [],
    pendingManaBonus: 0,
    pendingOverdriveStage: 0,
    pendingVoidCloak: false,
    turnHistory: [],
  };
}

export function connectLocalAbilityTrainingClient(): void {
  if (!active || clientAttached) return;
  clientAttached = true;
  emit("ability_room_joined", {
    roomId,
    color: "red",
    opponentNickname: "Training Dummy",
    training: true,
  });
  emit("ability_training_skill_select");
}

export function isLocalAbilityTrainingActive(): boolean {
  return active;
}

export function getLocalAbilityTrainingSocket(): TrainingSocket {
  return trainingSocket;
}

export function stopLocalAbilityTraining(): void {
  clearTimers();
  active = false;
  clientAttached = false;
  trainingSkillSelectionPending = false;
  redPlayer = null;
  bluePlayer = null;
  obstacles = [];
  lavaTiles = [];
  trapTiles = [];
}
