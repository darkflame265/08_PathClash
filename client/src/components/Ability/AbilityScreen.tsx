import { useEffect, useRef, useState, type CSSProperties } from "react";
import { getSocket } from "../../socket/socketClient";
import { syncServerTime, getEstimatedServerNow } from "../../socket/timeSync";
import { useLang } from "../../hooks/useLang";
import { useGameStore } from "../../store/gameStore";
import { TimerBar } from "../Game/TimerBar";
import { PlayerInfo } from "../Game/PlayerInfo";
import {
  playBigBang,
  playBlitz,
  playCharge,
  playEmber,
  playHealing,
  playHit,
  playInferno,
  playGuard,
  playArcReactor,
  playLobbyClick,
  playShieldBlock,
  playAtomicFission,
  playPhaseShift,
  preloadAbilitySfxAssets,
  playQuantum,
  playVoidCloak,
  startOverdriveLoop,
  stopOverdriveLoop,
} from "../../utils/soundUtils";
import type { BoardSkin, PlayerColor, Position } from "../../types/game.types";
import {
  ABILITY_SKILLS,
  type AbilityBattleState,
  type AbilityResolutionPayload,
  type AbilityRoundStartPayload,
  type AbilitySkillId,
  type AbilitySkillReservation,
} from "../../types/ability.types";
import { AbilityGrid } from "./AbilityGrid";
import "../Game/GameScreen.css";
import "../Game/GameGrid.css";
import "../Game/GameOverOverlay.css";
import "./AbilityScreen.css";

interface Props {
  onLeaveToLobby: () => void;
}

const DEFAULT_CELL = 96;
const MIN_CELL = 52;
const MAX_CELL = 160;
const STEP_DURATION_MS = 200;
const HIT_VISUAL_DELAY_MS = 0;
const SKILL_PAUSE_MS = 640;
const SKILL_CAST_DELAY_MS = 500;
const BLITZ_DASH_STEP_MS = 12;
const BLITZ_POST_HIT_PAUSE_MS = 640;
const VOID_REVEAL_PAUSE_MS = 450;
const AT_FIELD_VISUAL_STEPS = 1;
const GUARD_END_PAUSE_MS = 360;
const AT_FIELD_END_PAUSE_MS = 360;

type BoolByColor = { red: boolean; blue: boolean };
type NumberByColor = { red: number; blue: number };
type NullableNumberByColor = { red: number | null; blue: number | null };
type PositionByColor = { red: Position; blue: Position };
type NullablePositionByColor = { red: Position | null; blue: Position | null };
type PathsByColor = { red: Position[]; blue: Position[] };
type AtomicCloneVisual = {
  start: Position | null;
  path: Position[];
  step: number | null;
  position: Position | null;
};
type AtomicCloneVisualsByColor = {
  red: AtomicCloneVisual;
  blue: AtomicCloneVisual;
};

function createFalseFlags(): BoolByColor {
  return { red: false, blue: false };
}

function createZeroCounters(): NumberByColor {
  return { red: 0, blue: 0 };
}

function createNullSteps(): NullableNumberByColor {
  return { red: null, blue: null };
}

function createNullMarkers(): NullablePositionByColor {
  return { red: null, blue: null };
}

function createEmptyPaths(): PathsByColor {
  return { red: [], blue: [] };
}

function createEmptyAtomicClone(): AtomicCloneVisual {
  return { start: null, path: [], step: null, position: null };
}

function createEmptyAtomicCloneVisuals(): AtomicCloneVisualsByColor {
  return {
    red: createEmptyAtomicClone(),
    blue: createEmptyAtomicClone(),
  };
}

function collectSkillEventsByStep(
  events: AbilityResolutionPayload["skillEvents"],
) {
  const skillMap = new Map<number, AbilityResolutionPayload["skillEvents"]>();
  for (const event of events) {
    const list = skillMap.get(event.step) ?? [];
    list.push(event);
    skillMap.set(
      event.step,
      list.sort((left, right) => {
        const leftPriority = getSkillPriority(left.skillId);
        const rightPriority = getSkillPriority(right.skillId);
        if (leftPriority !== rightPriority) return leftPriority - rightPriority;
        return left.order - right.order;
      }),
    );
  }
  return skillMap;
}

function collectCollisionsByStep(
  collisions: AbilityResolutionPayload["collisions"],
) {
  const collisionMap = new Map<number, AbilityResolutionPayload["collisions"]>();
  for (const collision of collisions) {
    const list = collisionMap.get(collision.step) ?? [];
    list.push(collision);
    collisionMap.set(collision.step, list);
  }
  return collisionMap;
}

function collectBlocksByStep(blocks: AbilityResolutionPayload["blocks"]) {
  const blockMap = new Map<number, AbilityResolutionPayload["blocks"]>();
  for (const block of blocks) {
    const list = blockMap.get(block.step) ?? [];
    list.push(block);
    blockMap.set(block.step, list);
  }
  return blockMap;
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

function getClonePositionForStep(
  cloneStart: Position | null,
  clonePath: Position[],
  cloneStep: number | null,
  currentStep: number,
): Position | null {
  if (!cloneStart || cloneStep === null) return null;
  if (currentStep < cloneStep) return null;
  if (currentStep === cloneStep) return cloneStart;
  const pathIndex = currentStep - cloneStep - 1;
  if (pathIndex < clonePath.length) {
    return clonePath[pathIndex];
  }
  return clonePath[clonePath.length - 1] ?? cloneStart;
}

function computeInitialCellSize(): number {
  const availW = Math.max(260, window.innerWidth - 24);
  return Math.max(MIN_CELL, Math.min(MAX_CELL, availW / 5));
}

function renderSkillIcon(skillId: AbilitySkillId) {
  const skill = ABILITY_SKILLS[skillId];
  if (skillId === "phase_shift") {
    return (
      <span
        className="ability-skill-icon-custom ability-skill-icon-phase-shift"
        aria-hidden="true"
      >
        <span className="ability-skill-icon-phase-back" />
        <span className="ability-skill-icon-phase-front" />
      </span>
    );
  }
  if (skillId === "arc_reactor_field") {
    return (
      <span
        className="ability-skill-icon-custom ability-skill-icon-arc-field"
        aria-hidden="true"
      >
        <span className="ability-skill-icon-arc-core" />
        <span className="ability-skill-icon-arc-ring ability-skill-icon-arc-ring-a" />
        <span className="ability-skill-icon-arc-ring ability-skill-icon-arc-ring-b" />
      </span>
    );
  }
  if (skillId === "void_cloak") {
    return (
      <span
        className="ability-skill-icon-custom ability-skill-icon-void"
        aria-hidden="true"
      >
        <span className="ability-skill-icon-void-eye" />
        <span className="ability-skill-icon-void-pupil" />
        <span className="ability-skill-icon-void-slash" />
      </span>
    );
  }
  if (skillId === "cosmic_bigbang") {
    return (
      <span
        className="ability-skill-icon-custom ability-skill-icon-bigbang"
        aria-hidden="true"
      >
        <span className="ability-skill-icon-bigbang-core" />
        <span className="ability-skill-icon-bigbang-ring ability-skill-icon-bigbang-ring-a" />
        <span className="ability-skill-icon-bigbang-ring ability-skill-icon-bigbang-ring-b" />
        <span className="ability-skill-icon-bigbang-rays" />
      </span>
    );
  }
  const icon = skillId === "electric_blitz" ? "⚡︎" : skill.icon;
  return (
    <span
      className={`ability-skill-icon-glyph${skillId === "electric_blitz" ? " is-electric-blitz" : ""}${skillId === "aurora_heal" ? " is-aurora-heal" : ""}${skillId === "gold_overdrive" ? " is-gold-overdrive" : ""}`}
      aria-hidden="true"
    >
      {icon}
    </span>
  );
}

function getSkillPriority(skillId: AbilitySkillId): number {
  return ABILITY_SKILLS[skillId].category === "utility"
    ? 0
    : ABILITY_SKILLS[skillId].category === "defense"
      ? 1
      : 2;
}

function useAdaptiveCellSize(
  gridAreaRef: React.RefObject<HTMLDivElement | null>,
) {
  const [cellSize, setCellSize] = useState(computeInitialCellSize);

  useEffect(() => {
    const el = gridAreaRef.current;
    if (!el) return;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const squareSide = Math.min(width, height > 60 ? height : width);
      const next = Math.max(MIN_CELL, Math.min(MAX_CELL, squareSide / 5));
      setCellSize(next);
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [gridAreaRef]);

  return cellSize;
}

export function AbilityScreen({ onLeaveToLobby }: Props) {
  const { lang } = useLang();
  const {
    myColor,
    setMyColor,
    setRoomCode,
    accountDailyRewardTokens,
    rematchRequestSent,
    setRematchRequestSent,
    isSfxMuted,
    sfxVolume,
    triggerHeartShake,
    boardSkin,
  } = useGameStore();

  const [state, setState] = useState<AbilityBattleState | null>(null);
  const [roundInfo, setRoundInfo] = useState<AbilityRoundStartPayload | null>(
    null,
  );
  const [myPath, setMyPath] = useState<Position[]>([]);
  const [mySubmitted, setMySubmitted] = useState(false);
  const [, setOpponentSubmitted] = useState(false);
  const [skillReservations, setSkillReservations] = useState<
    AbilitySkillReservation[]
  >([]);
  const [selectedSkillId, setSelectedSkillId] = useState<AbilitySkillId | null>(
    null,
  );
  const [pendingTeleport, setPendingTeleport] = useState(false);
  const [pendingBlitz, setPendingBlitz] = useState(false);
  const [pendingInferno, setPendingInferno] = useState(false);
  const [redDisplayPos, setRedDisplayPos] = useState<Position>({
    row: 2,
    col: 0,
  });
  const [blueDisplayPos, setBlueDisplayPos] = useState<Position>({
    row: 2,
    col: 4,
  });
  const [hitFlags, setHitFlags] = useState<{ red: boolean; blue: boolean }>({
    red: false,
    blue: false,
  });
  const [explodingFlags, setExplodingFlags] = useState<{
    red: boolean;
    blue: boolean;
  }>({ red: false, blue: false });
  const [collisionEffects, setCollisionEffects] = useState<
    Array<{ id: number; position: Position }>
  >([]);
  const [teleportEffects, setTeleportEffects] = useState<
    Array<{ id: number; color: PlayerColor; from: Position; to: Position }>
  >([]);
  const [chargeEffects, setChargeEffects] = useState<
    Array<{ id: number; color: PlayerColor; position: Position }>
  >([]);
  const [healEffects, setHealEffects] = useState<
    Array<{ id: number; color: PlayerColor; position: Position }>
  >([]);
  const [, setHealHeartEffects] = useState<{
    red: number | null;
    blue: number | null;
  }>({ red: null, blue: null });
  const [activeGuards, setActiveGuards] = useState<BoolByColor>(
    createFalseFlags,
  );
  const [activeAtFields, setActiveAtFields] = useState<BoolByColor>(
    createFalseFlags,
  );
  const [activePhaseShifts, setActivePhaseShifts] = useState<BoolByColor>(
    createFalseFlags,
  );
  const [movingPaths, setMovingPaths] = useState<PathsByColor>(createEmptyPaths);
  const [movingStarts, setMovingStarts] = useState<PositionByColor | null>(
    null,
  );
  const [movingTeleportMarkers, setMovingTeleportMarkers] =
    useState<NullablePositionByColor>(createNullMarkers);
  const [movingTeleportSteps, setMovingTeleportSteps] =
    useState<NullableNumberByColor>(createNullSteps);
  const [movingBlitzColors, setMovingBlitzColors] = useState<BoolByColor>(
    createFalseFlags,
  );
  const [movingBlitzProgress, setMovingBlitzProgress] = useState<NumberByColor>(
    createZeroCounters,
  );
  const [movingBlitzSteps, setMovingBlitzSteps] =
    useState<NullableNumberByColor>(createNullSteps);
  const [movingAtomicClones, setMovingAtomicClones] =
    useState<AtomicCloneVisualsByColor>(createEmptyAtomicCloneVisuals);
  const [winner, setWinner] = useState<PlayerColor | "draw" | null>(null);
  const [gameOverMessage, setGameOverMessage] = useState<string | null>(null);
  const [rematchRequested, setRematchRequested] = useState(false);
  const [abilityBanner, setAbilityBanner] = useState<string | null>(null);
  const [mySkillInfo, setMySkillInfo] = useState<AbilitySkillId | null>(null);

  const stateRef = useRef<AbilityBattleState | null>(null);
  const animationTimeoutIdsRef = useRef<number[]>([]);
  const submitTimeoutIdsRef = useRef<number[]>([]);
  const gridAreaRef = useRef<HTMLDivElement>(null);
  const cellSize = useAdaptiveCellSize(gridAreaRef);
  const scale = cellSize / DEFAULT_CELL;
  const currentColor = myColor ?? "red";
  const opponentColor: PlayerColor = currentColor === "red" ? "blue" : "red";
  const previousGuardPathRef = useRef<Position[]>([]);
  const previousChargePathRef = useRef<Position[]>([]);
  const previousBlitzPathRef = useRef<Position[]>([]);
  const previousBigBangPathRef = useRef<Position[]>([]);
  const previousTeleportPathRef = useRef<Position[]>([]);
  const reservationOrderRef = useRef(1);
  const skillPressTimeoutRef = useRef<number | null>(null);
  const longPressTriggeredRef = useRef(false);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);

  useEffect(() => {
    preloadAbilitySfxAssets();
  }, []);

  useEffect(() => {
    const hasOverdriveActive =
      !!state &&
      (state.players.red.overdriveActive || state.players.blue.overdriveActive);
    const isGameOver = state?.phase === "gameover" || winner !== null;

    if (!isGameOver && hasOverdriveActive && !isSfxMuted) {
      startOverdriveLoop(sfxVolume);
    } else {
      stopOverdriveLoop();
    }

    return () => {
      stopOverdriveLoop();
    };
  }, [isSfxMuted, sfxVolume, state, winner]);

  useEffect(() => {
    const handleGlobalPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.closest(
          ".ability-skill-btn, .ability-skill-tooltip, .ability-opponent-skill",
        )
      ) {
        return;
      }
      setMySkillInfo(null);
    };

    document.addEventListener("pointerdown", handleGlobalPointerDown);
    return () => {
      document.removeEventListener("pointerdown", handleGlobalPointerDown);
    };
  }, []);

  const clearAnimationTimeouts = () => {
    for (const timeoutId of animationTimeoutIdsRef.current) {
      window.clearTimeout(timeoutId);
    }
    animationTimeoutIdsRef.current = [];
  };

  const queueAnimationTimeout = (callback: () => void, delay: number) => {
    const timeoutId = window.setTimeout(() => {
      animationTimeoutIdsRef.current = animationTimeoutIdsRef.current.filter(
        (value) => value !== timeoutId,
      );
      callback();
    }, delay);
    animationTimeoutIdsRef.current.push(timeoutId);
  };

  const clearSubmitTimeouts = () => {
    for (const timeoutId of submitTimeoutIdsRef.current) {
      window.clearTimeout(timeoutId);
    }
    submitTimeoutIdsRef.current = [];
  };

  const queueSubmitTimeout = (callback: () => void, delay: number) => {
    const timeoutId = window.setTimeout(() => {
      submitTimeoutIdsRef.current = submitTimeoutIdsRef.current.filter(
        (value) => value !== timeoutId,
      );
      callback();
    }, delay);
    submitTimeoutIdsRef.current.push(timeoutId);
  };

  const clearSkillPressTimeout = () => {
    if (skillPressTimeoutRef.current !== null) {
      window.clearTimeout(skillPressTimeoutRef.current);
      skillPressTimeoutRef.current = null;
    }
  };

  const resetPlanningState = () => {
    setMyPath([]);
    setSkillReservations([]);
    setSelectedSkillId(null);
    setPendingTeleport(false);
    setPendingBlitz(false);
    setPendingInferno(false);
    setMySubmitted(false);
    setOpponentSubmitted(false);
    previousGuardPathRef.current = [];
    previousChargePathRef.current = [];
    previousBlitzPathRef.current = [];
    previousBigBangPathRef.current = [];
    previousTeleportPathRef.current = [];
    reservationOrderRef.current = 1;
  };

  const resetTransientVisualState = () => {
    setHitFlags(createFalseFlags());
    setExplodingFlags(createFalseFlags());
    setCollisionEffects([]);
    setTeleportEffects([]);
  };

  const resetMovingVisualState = () => {
    setMovingPaths(createEmptyPaths());
    setMovingStarts(null);
    setMovingTeleportMarkers(createNullMarkers());
    setMovingTeleportSteps(createNullSteps());
    setMovingBlitzColors(createFalseFlags());
    setMovingBlitzProgress(createZeroCounters());
    setMovingBlitzSteps(createNullSteps());
    setMovingAtomicClones(createEmptyAtomicCloneVisuals());
  };

  const resetPersistentDefenseVisualState = () => {
    setActiveAtFields(createFalseFlags());
    setActivePhaseShifts(createFalseFlags());
  };

  const resetMatchUiState = () => {
    setWinner(null);
    setGameOverMessage(null);
    setRematchRequested(false);
    setRematchRequestSent(false);
  };

  const applyMovingPayloadState = (
    payload: AbilityResolutionPayload,
    nextPhaseShiftFlags: BoolByColor,
    nextMovingStarts: PositionByColor,
    nextTeleportMarkers: NullablePositionByColor,
    nextTeleportSteps: NullableNumberByColor,
    nextBlitzColors: BoolByColor,
    nextBlitzSteps: NullableNumberByColor,
    nextAtomicClones: AtomicCloneVisualsByColor,
  ) => {
    setMovingPaths({ red: payload.redPath, blue: payload.bluePath });
    setMovingBlitzColors(nextBlitzColors);
    setMovingBlitzProgress(createZeroCounters());
    setMovingBlitzSteps(nextBlitzSteps);
    setMovingAtomicClones(nextAtomicClones);
    setMovingTeleportMarkers(nextTeleportMarkers);
    setMovingTeleportSteps(nextTeleportSteps);
    setMovingStarts(nextMovingStarts);
    setActivePhaseShifts(nextPhaseShiftFlags);
  };

  const applyState = (nextState: AbilityBattleState) => {
    stateRef.current = nextState;
    setState(nextState);
    setRedDisplayPos(nextState.players.red.position);
    setBlueDisplayPos(nextState.players.blue.position);
    setActiveGuards({
      red: nextState.players.red.invulnerableSteps > 0,
      blue: nextState.players.blue.invulnerableSteps > 0,
    });
    resetPersistentDefenseVisualState();
    resetTransientVisualState();
    resetMovingVisualState();
    if (nextState.phase !== "gameover") {
      resetMatchUiState();
    }
  };

  const getMyRole = () => state?.players[currentColor].role ?? "escaper";
  const getMyMana = () => state?.players[currentColor].mana ?? 0;
  const isOverdriveTurn = () =>
    state?.players[currentColor].overdriveActive ?? false;
  const getPreviewStart = () => {
    const teleport = skillReservations.find(
      (entry) => entry.skillId === "quantum_shift" && entry.target,
    );
    if (teleport?.target && teleport.step === 0) {
      return teleport.target;
    }
    return state?.players[currentColor].position ?? { row: 2, col: 0 };
  };

  const getAvailableSkills = () =>
    state?.players[currentColor].equippedSkills ?? [];
  const teleportReservation =
    skillReservations.find(
      (entry) => entry.skillId === "quantum_shift" && entry.target,
    ) ?? null;
  const infernoReservation =
    skillReservations.find(
      (entry) => entry.skillId === "inferno_field" && entry.target,
    ) ?? null;
  const atomicReservation =
    skillReservations.find((entry) => entry.skillId === "atomic_fission") ??
    null;
  const getSkillCost = (skillId: AbilitySkillId) =>
    ABILITY_SKILLS[skillId].manaCost;
  const getReservedMana = () =>
    skillReservations.reduce(
      (sum, reservation) => sum + getSkillCost(reservation.skillId),
      0,
    );
  const getRemainingMana = () => Math.max(0, getMyMana() - getReservedMana());
  const getCurrentSkillStep = () => {
    const blitzReservation = skillReservations.find(
      (entry) => entry.skillId === "electric_blitz" && entry.target,
    );
    if (!blitzReservation?.target) return myPath.length;
    const blitzOrigin =
      blitzReservation.step > 0
        ? myPath[blitzReservation.step - 1]
        : (state?.players[currentColor].position ?? { row: 2, col: 0 });
    if (!blitzOrigin) return myPath.length;
    const blitzPath = buildBlitzPath(blitzOrigin, blitzReservation.target);
    if (blitzPath.length === 0) return myPath.length;
    return Math.max(0, myPath.length - blitzPath.length);
  };

  const syncMyPlan = (
    path: Position[],
    reservations: AbilitySkillReservation[],
  ) => {
    const socket = getSocket();
    socket.emit("ability_plan_update", { path, skills: reservations });
  };

  const updateMyPath = (nextPath: Position[]) => {
    const nextReservations = skillReservations.filter(
      (reservation) => reservation.step <= nextPath.length,
    );
    setMyPath(nextPath);
    if (nextReservations !== skillReservations) {
      setSkillReservations(nextReservations);
    }
    syncMyPlan(nextPath, nextReservations);
  };

  const updateSkillReservations = (
    nextReservations: AbilitySkillReservation[],
  ) => {
    setSkillReservations(nextReservations);
    syncMyPlan(myPath, nextReservations);
  };

  const removeReservation = (skillId: AbilitySkillId) => {
    const nextReservations = skillReservations.filter(
      (entry) => entry.skillId !== skillId,
    );
    const overdriveTurn = isOverdriveTurn();
    setSelectedSkillId(null);
    setPendingTeleport(false);
    setPendingBlitz(false);
    setPendingInferno(false);

    if (skillId === "classic_guard") {
      if (overdriveTurn) {
        updateSkillReservations(nextReservations);
        return;
      }
      const chargeReserved = nextReservations.some(
        (entry) => entry.skillId === "plasma_charge",
      );
      const restorePath = chargeReserved ? [] : previousGuardPathRef.current;
      setMyPath(restorePath);
      setSkillReservations(nextReservations);
      syncMyPlan(restorePath, nextReservations);
      return;
    }

    if (skillId === "plasma_charge") {
      if (overdriveTurn) {
        updateSkillReservations(nextReservations);
        return;
      }
      const guardReserved = nextReservations.some(
        (entry) => entry.skillId === "classic_guard",
      );
      const restorePath = guardReserved ? [] : previousChargePathRef.current;
      setMyPath(restorePath);
      setSkillReservations(nextReservations);
      syncMyPlan(restorePath, nextReservations);
      return;
    }

    if (skillId === "quantum_shift") {
      setMyPath(previousTeleportPathRef.current);
      setSkillReservations(nextReservations);
      syncMyPlan(previousTeleportPathRef.current, nextReservations);
      return;
    }

    if (skillId === "electric_blitz") {
      setMyPath(previousBlitzPathRef.current);
      setSkillReservations(nextReservations);
      syncMyPlan(previousBlitzPathRef.current, nextReservations);
      return;
    }

    if (skillId === "cosmic_bigbang") {
      if (overdriveTurn) {
        updateSkillReservations(nextReservations);
        return;
      }
      setMyPath(previousBigBangPathRef.current);
      setSkillReservations(nextReservations);
      syncMyPlan(previousBigBangPathRef.current, nextReservations);
      return;
    }

    updateSkillReservations(nextReservations);
  };

  const toggleGuardSkill = () => {
    const alreadyReserved = skillReservations.some(
      (entry) => entry.skillId === "classic_guard",
    );
    if (alreadyReserved) {
      removeReservation("classic_guard");
      return;
    }
    if (getMyRole() !== "escaper") return;
    if (getRemainingMana() < getSkillCost("classic_guard")) return;
    if (isOverdriveTurn()) {
      const nextReservations: AbilitySkillReservation[] = [
        ...skillReservations.filter(
          (entry) => entry.skillId !== "classic_guard",
        ),
        {
          skillId: "classic_guard",
          step: getCurrentSkillStep(),
          order: reservationOrderRef.current++,
        },
      ];
      setSkillReservations(nextReservations);
      setSelectedSkillId(null);
      syncMyPlan(myPath, nextReservations);
      return;
    }
    previousGuardPathRef.current = myPath;
    const nextReservations: AbilitySkillReservation[] = [
      ...skillReservations.filter((entry) => entry.skillId !== "classic_guard"),
      {
        skillId: "classic_guard",
        step: 0,
        order: reservationOrderRef.current++,
      },
    ];
    setMyPath([]);
    setSkillReservations(nextReservations);
    setSelectedSkillId(null);
    syncMyPlan([], nextReservations);
  };

  const togglePhaseShiftSkill = () => {
    const alreadyReserved = skillReservations.some(
      (entry) => entry.skillId === "phase_shift",
    );
    if (alreadyReserved) {
      removeReservation("phase_shift");
      return;
    }
    if (getMyRole() !== "escaper") return;
    if (getRemainingMana() < getSkillCost("phase_shift")) return;
    const nextReservations: AbilitySkillReservation[] = [
      ...skillReservations.filter((entry) => entry.skillId !== "phase_shift"),
      {
        skillId: "phase_shift",
        step: 0,
        order: reservationOrderRef.current++,
      },
    ];
    setSkillReservations(nextReservations);
    setSelectedSkillId(null);
    syncMyPlan(myPath, nextReservations);
  };

  const toggleAtFieldSkill = () => {
    const alreadyReserved = skillReservations.some(
      (entry) => entry.skillId === "arc_reactor_field",
    );
    if (alreadyReserved) {
      removeReservation("arc_reactor_field");
      return;
    }
    if (getMyRole() !== "escaper") return;
    if (getRemainingMana() < getSkillCost("arc_reactor_field")) return;
    const nextReservations: AbilitySkillReservation[] = [
      ...skillReservations.filter(
        (entry) => entry.skillId !== "arc_reactor_field",
      ),
      {
        skillId: "arc_reactor_field",
        step: getCurrentSkillStep(),
        order: reservationOrderRef.current++,
      },
    ];
    setSkillReservations(nextReservations);
    setSelectedSkillId(null);
    syncMyPlan(myPath, nextReservations);
  };

  const beginExplosionStepPick = () => {
    const alreadyReserved = skillReservations.some(
      (entry) => entry.skillId === "ember_blast",
    );
    if (alreadyReserved) {
      removeReservation("ember_blast");
      return;
    }
    if (getMyRole() !== "attacker") return;
    if (getRemainingMana() < getSkillCost("ember_blast")) return;
    const nextReservations: AbilitySkillReservation[] = [
      ...skillReservations.filter((entry) => entry.skillId !== "ember_blast"),
      {
        skillId: "ember_blast",
        step: getCurrentSkillStep(),
        order: reservationOrderRef.current++,
      },
    ];
    updateSkillReservations(nextReservations);
    setSelectedSkillId(null);
    setPendingTeleport(false);
  };

  const beginAtomicFissionStepPick = () => {
    const alreadyReserved = skillReservations.some(
      (entry) => entry.skillId === "atomic_fission",
    );
    if (alreadyReserved) {
      removeReservation("atomic_fission");
      return;
    }
    if (getMyRole() !== "attacker") return;
    if (getRemainingMana() < getSkillCost("atomic_fission")) return;
    const hasPreviousTurnPath =
      !!state?.players[currentColor].previousTurnStart &&
      (state?.players[currentColor].previousTurnPath.length ?? 0) > 0;
    if (!hasPreviousTurnPath) return;
    const nextReservations: AbilitySkillReservation[] = [
      ...skillReservations.filter(
        (entry) => entry.skillId !== "atomic_fission",
      ),
      {
        skillId: "atomic_fission",
        step: 0,
        order: reservationOrderRef.current++,
      },
    ];
    updateSkillReservations(nextReservations);
    setSelectedSkillId(null);
    setPendingTeleport(false);
  };

  const beginNovaStepPick = () => {
    const alreadyReserved = skillReservations.some(
      (entry) => entry.skillId === "nova_blast",
    );
    if (alreadyReserved) {
      removeReservation("nova_blast");
      return;
    }
    if (getMyRole() !== "attacker") return;
    if (getRemainingMana() < getSkillCost("nova_blast")) return;
    const nextReservations: AbilitySkillReservation[] = [
      ...skillReservations.filter((entry) => entry.skillId !== "nova_blast"),
      {
        skillId: "nova_blast",
        step: getCurrentSkillStep(),
        order: reservationOrderRef.current++,
      },
    ];
    updateSkillReservations(nextReservations);
    setSelectedSkillId(null);
    setPendingTeleport(false);
  };

  const beginHealStepPick = () => {
    const alreadyReserved = skillReservations.some(
      (entry) => entry.skillId === "aurora_heal",
    );
    if (alreadyReserved) {
      removeReservation("aurora_heal");
      return;
    }
    if (getRemainingMana() < getSkillCost("aurora_heal")) return;
    const nextReservations: AbilitySkillReservation[] = [
      ...skillReservations.filter((entry) => entry.skillId !== "aurora_heal"),
      {
        skillId: "aurora_heal",
        step: getCurrentSkillStep(),
        order: reservationOrderRef.current++,
      },
    ];
    updateSkillReservations(nextReservations);
    setSelectedSkillId(null);
    setPendingTeleport(false);
  };

  const beginOverdriveStepPick = () => {
    const alreadyReserved = skillReservations.some(
      (entry) => entry.skillId === "gold_overdrive",
    );
    if (alreadyReserved) {
      removeReservation("gold_overdrive");
      return;
    }
    if (getRemainingMana() < getSkillCost("gold_overdrive")) return;
    const nextReservations: AbilitySkillReservation[] = [
      ...skillReservations.filter(
        (entry) => entry.skillId !== "gold_overdrive",
      ),
      {
        skillId: "gold_overdrive",
        step: getCurrentSkillStep(),
        order: reservationOrderRef.current++,
      },
    ];
    updateSkillReservations(nextReservations);
    setSelectedSkillId(null);
    setPendingTeleport(false);
  };

  const beginVoidCloakStepPick = () => {
    const alreadyReserved = skillReservations.some(
      (entry) => entry.skillId === "void_cloak",
    );
    if (alreadyReserved) {
      removeReservation("void_cloak");
      return;
    }
    if (getRemainingMana() < getSkillCost("void_cloak")) return;
    const nextReservations: AbilitySkillReservation[] = [
      ...skillReservations.filter((entry) => entry.skillId !== "void_cloak"),
      {
        skillId: "void_cloak",
        step: getCurrentSkillStep(),
        order: reservationOrderRef.current++,
      },
    ];
    updateSkillReservations(nextReservations);
    setSelectedSkillId(null);
    setPendingTeleport(false);
  };

  const beginInfernoPick = () => {
    const alreadyReserved = skillReservations.some(
      (entry) => entry.skillId === "inferno_field",
    );
    if (alreadyReserved) {
      removeReservation("inferno_field");
      return;
    }
    if (pendingInferno && selectedSkillId === "inferno_field") {
      setSelectedSkillId(null);
      setPendingInferno(false);
      return;
    }
    if (getMyRole() !== "attacker") return;
    if (getRemainingMana() < getSkillCost("inferno_field")) return;
    setSelectedSkillId("inferno_field");
    setPendingInferno(true);
    setPendingTeleport(false);
    setPendingBlitz(false);
  };

  const handleInfernoTargetSelect = (target: Position) => {
    const nextReservations: AbilitySkillReservation[] = [
      ...skillReservations.filter((entry) => entry.skillId !== "inferno_field"),
      {
        skillId: "inferno_field",
        step: getCurrentSkillStep(),
        order: reservationOrderRef.current++,
        target,
      },
    ];
    setSkillReservations(nextReservations);
    setSelectedSkillId(null);
    setPendingInferno(false);
    syncMyPlan(myPath, nextReservations);
  };

  const beginTeleportPick = () => {
    const alreadyReserved = skillReservations.some(
      (entry) => entry.skillId === "quantum_shift",
    );
    if (alreadyReserved) {
      removeReservation("quantum_shift");
      return;
    }
    if (pendingTeleport && selectedSkillId === "quantum_shift") {
      setSelectedSkillId(null);
      setPendingTeleport(false);
      return;
    }
    if (getRemainingMana() < getSkillCost("quantum_shift")) return;
    previousTeleportPathRef.current = myPath;
    setSelectedSkillId("quantum_shift");
    setPendingTeleport(true);
    setPendingBlitz(false);
  };

  const handleTeleportTargetSelect = (target: Position) => {
    const teleportStep = myPath.length;
    const nextReservations: AbilitySkillReservation[] = [
      ...skillReservations.filter((entry) => entry.skillId !== "quantum_shift"),
      {
        skillId: "quantum_shift",
        step: teleportStep,
        order: reservationOrderRef.current++,
        target,
      },
    ];
    setSkillReservations(nextReservations);
    setSelectedSkillId(null);
    setPendingTeleport(false);
    syncMyPlan(myPath, nextReservations);
  };

  const handleTeleportCancel = () => {
    setSelectedSkillId(null);
    setPendingTeleport(false);
  };

  const beginBlitzPick = () => {
    const alreadyReserved = skillReservations.some(
      (entry) => entry.skillId === "electric_blitz",
    );
    if (alreadyReserved) {
      removeReservation("electric_blitz");
      return;
    }
    if (pendingBlitz && selectedSkillId === "electric_blitz") {
      setSelectedSkillId(null);
      setPendingBlitz(false);
      return;
    }
    if (getMyRole() !== "attacker") return;
    if (getRemainingMana() < getSkillCost("electric_blitz")) return;
    previousBlitzPathRef.current = myPath;
    setSelectedSkillId("electric_blitz");
    setPendingBlitz(true);
    setPendingTeleport(false);
  };

  const handleBlitzTargetSelect = (target: Position) => {
    const start =
      myPath.length > 0
        ? myPath[myPath.length - 1]
        : (state?.players[currentColor].position ?? { row: 2, col: 0 });
    const prefixPath = [...myPath];
    const blitzPath = buildBlitzPath(start, target);
    const nextPath = [...prefixPath, ...blitzPath];
    if (nextPath.length === 0) return;
    const nextReservations: AbilitySkillReservation[] = [
      ...(isOverdriveTurn()
        ? skillReservations.filter(
            (entry) => entry.skillId !== "electric_blitz",
          )
        : []),
      {
        skillId: "electric_blitz",
        step: prefixPath.length,
        order: reservationOrderRef.current++,
        target,
      },
    ];
    setMyPath(nextPath);
    setSkillReservations(nextReservations);
    setSelectedSkillId(null);
    setPendingTeleport(false);
    setPendingBlitz(false);
    syncMyPlan(nextPath, nextReservations);
  };

  const togglePlasmaCharge = () => {
    const alreadyReserved = skillReservations.some(
      (entry) => entry.skillId === "plasma_charge",
    );
    if (alreadyReserved) {
      removeReservation("plasma_charge");
      return;
    }
    if (getRemainingMana() < getSkillCost("plasma_charge")) return;
    if (isOverdriveTurn()) {
      const nextReservations: AbilitySkillReservation[] = [
        ...skillReservations.filter(
          (entry) => entry.skillId !== "plasma_charge",
        ),
        {
          skillId: "plasma_charge",
          step: getCurrentSkillStep(),
          order: reservationOrderRef.current++,
        },
      ];
      setSkillReservations(nextReservations);
      setSelectedSkillId(null);
      setPendingTeleport(false);
      setPendingBlitz(false);
      syncMyPlan(myPath, nextReservations);
      return;
    }
    previousChargePathRef.current = myPath;
    const nextReservations: AbilitySkillReservation[] = [
      ...skillReservations.filter((entry) => entry.skillId !== "plasma_charge"),
      {
        skillId: "plasma_charge",
        step: 0,
        order: reservationOrderRef.current++,
      },
    ];
    setMyPath([]);
    setSkillReservations(nextReservations);
    setSelectedSkillId(null);
    setPendingTeleport(false);
    setPendingBlitz(false);
    syncMyPlan([], nextReservations);
  };

  const toggleCosmicBigBang = () => {
    const alreadyReserved = skillReservations.some(
      (entry) => entry.skillId === "cosmic_bigbang",
    );
    if (alreadyReserved) {
      removeReservation("cosmic_bigbang");
      return;
    }
    if (getMyRole() !== "attacker") return;
    if (getRemainingMana() < getSkillCost("cosmic_bigbang")) return;
    if (isOverdriveTurn()) {
      const nextReservations: AbilitySkillReservation[] = [
        ...skillReservations.filter(
          (entry) => entry.skillId !== "cosmic_bigbang",
        ),
        {
          skillId: "cosmic_bigbang",
          step: getCurrentSkillStep(),
          order: reservationOrderRef.current++,
        },
      ];
      setSkillReservations(nextReservations);
      setSelectedSkillId(null);
      setPendingTeleport(false);
      setPendingBlitz(false);
      syncMyPlan(myPath, nextReservations);
      return;
    }
    previousBigBangPathRef.current = myPath;
    const nextReservations: AbilitySkillReservation[] = [
      {
        skillId: "cosmic_bigbang",
        step: 0,
        order: reservationOrderRef.current++,
      },
    ];
    setMyPath([]);
    setSkillReservations(nextReservations);
    setSelectedSkillId(null);
    setPendingTeleport(false);
    setPendingBlitz(false);
    syncMyPlan([], nextReservations);
  };

  const handleSkillClick = (skillId: AbilitySkillId) => {
    if (state?.phase !== "planning" || mySubmitted) return;
    if (skillId !== "inferno_field") {
      setPendingInferno(false);
    }
    if (skillId === "classic_guard") {
      toggleGuardSkill();
      return;
    }
    if (skillId === "phase_shift") {
      togglePhaseShiftSkill();
      return;
    }
    if (skillId === "arc_reactor_field") {
      toggleAtFieldSkill();
      return;
    }
    if (skillId === "ember_blast") {
      beginExplosionStepPick();
      return;
    }
    if (skillId === "atomic_fission") {
      beginAtomicFissionStepPick();
      return;
    }
    if (skillId === "nova_blast") {
      beginNovaStepPick();
      return;
    }
    if (skillId === "aurora_heal") {
      beginHealStepPick();
      return;
    }
    if (skillId === "gold_overdrive") {
      beginOverdriveStepPick();
      return;
    }
    if (skillId === "void_cloak") {
      beginVoidCloakStepPick();
      return;
    }
    if (skillId === "inferno_field") {
      beginInfernoPick();
      return;
    }
    if (skillId === "quantum_shift") {
      beginTeleportPick();
      return;
    }
    if (skillId === "plasma_charge") {
      togglePlasmaCharge();
      return;
    }
    if (skillId === "electric_blitz") {
      beginBlitzPick();
      return;
    }
    if (skillId === "cosmic_bigbang") {
      toggleCosmicBigBang();
    }
  };

  const triggerLocalHit = (
    color: PlayerColor,
    hpAfter: number,
    position: Position,
  ) => {
    queueAnimationTimeout(() => {
      setHitFlags((prev) => ({ ...prev, [color]: true }));
      queueAnimationTimeout(() => {
        setHitFlags((prev) => ({ ...prev, [color]: false }));
      }, 650);
      triggerHeartShake(color, Math.max(0, hpAfter));
      const effectId = Date.now() + Math.random();
      setCollisionEffects((prev) => [...prev, { id: effectId, position }]);
      queueAnimationTimeout(() => {
        setCollisionEffects((prev) =>
          prev.filter((entry) => entry.id !== effectId),
        );
      }, 600);
      if (!isSfxMuted) playHit(sfxVolume);
      if (hpAfter <= 0) {
        queueAnimationTimeout(() => {
          setExplodingFlags((prev) => ({ ...prev, [color]: true }));
          queueAnimationTimeout(() => {
            setExplodingFlags((prev) => ({ ...prev, [color]: false }));
          }, 600);
        }, 600);
      }
    }, HIT_VISUAL_DELAY_MS);
  };

  const triggerTeleportEffect = (
    color: PlayerColor,
    from: Position,
    to: Position,
  ) => {
    const effectId = Date.now() + Math.random();
    setTeleportEffects((prev) => [...prev, { id: effectId, color, from, to }]);
    queueAnimationTimeout(() => {
      setTeleportEffects((prev) =>
        prev.filter((entry) => entry.id !== effectId),
      );
    }, 520);
  };

  const triggerChargeEffect = (color: PlayerColor, position: Position) => {
    const effectId = Date.now() + Math.random();
    setChargeEffects((prev) => [...prev, { id: effectId, color, position }]);
    queueAnimationTimeout(() => {
      setChargeEffects((prev) => prev.filter((entry) => entry.id !== effectId));
    }, 1800);
  };

  const triggerHealEffect = (
    color: PlayerColor,
    position: Position,
    healedHeartIndex: number,
  ) => {
    const effectId = Date.now() + Math.random();
    setHealEffects((prev) => [...prev, { id: effectId, color, position }]);
    setHealHeartEffects((prev) => ({ ...prev, [color]: healedHeartIndex }));
    queueAnimationTimeout(() => {
      setHealEffects((prev) => prev.filter((entry) => entry.id !== effectId));
    }, 1300);
    queueAnimationTimeout(() => {
      setHealHeartEffects((prev) =>
        prev[color] === healedHeartIndex ? { ...prev, [color]: null } : prev,
      );
    }, 950);
  };

  const runSkillEvent = (
    event: AbilityResolutionPayload["skillEvents"][number],
    done: () => void,
  ) => {
    const skill = ABILITY_SKILLS[event.skillId];
    setAbilityBanner(
      `${event.color === currentColor ? (lang === "en" ? "You" : "내 말") : lang === "en" ? "Enemy" : "상대"} · ${lang === "en" ? skill.name.en : skill.name.kr}`,
    );
    queueAnimationTimeout(() => {
      if (event.skillId === "classic_guard") {
        setActiveGuards((prev) => ({ ...prev, [event.color]: true }));
        if (!isSfxMuted) {
          playGuard(sfxVolume);
        }
      }

      if (event.skillId === "phase_shift") {
        setActivePhaseShifts((prev) => ({ ...prev, [event.color]: true }));
        if (!isSfxMuted) {
          playPhaseShift(sfxVolume);
        }
      }

      if (event.skillId === "arc_reactor_field") {
        setActiveAtFields((prev) => ({ ...prev, [event.color]: true }));
        if (!isSfxMuted) {
          playArcReactor(sfxVolume);
        }
      }

      if (event.skillId === "plasma_charge") {
        const position =
          event.color === "red"
            ? stateRef.current?.players.red.position
            : stateRef.current?.players.blue.position;
        if (position) {
          triggerChargeEffect(event.color, position);
        }
        if (!isSfxMuted) {
          playCharge(sfxVolume);
        }
      }

      if (event.skillId === "ember_blast") {
        if (!isSfxMuted) {
          playEmber(sfxVolume);
        }
        for (const position of event.affectedPositions ?? []) {
          const effectId = Date.now() + Math.random();
          setCollisionEffects((prev) => [...prev, { id: effectId, position }]);
          queueAnimationTimeout(() => {
            setCollisionEffects((prev) =>
              prev.filter((entry) => entry.id !== effectId),
            );
          }, 420);
        }
      }

      if (event.skillId === "atomic_fission") {
        if (!isSfxMuted) {
          playAtomicFission(sfxVolume);
        }
      }

      if (event.skillId === "nova_blast") {
        if (!isSfxMuted) {
          playEmber(sfxVolume);
        }
        for (const position of event.affectedPositions ?? []) {
          const effectId = Date.now() + Math.random();
          setCollisionEffects((prev) => [...prev, { id: effectId, position }]);
          queueAnimationTimeout(() => {
            setCollisionEffects((prev) =>
              prev.filter((entry) => entry.id !== effectId),
            );
          }, 420);
        }
      }

      if (event.skillId === "inferno_field") {
        if (!isSfxMuted) {
          playInferno(sfxVolume);
        }
        for (const position of event.affectedPositions ?? []) {
          const effectId = Date.now() + Math.random();
          setCollisionEffects((prev) => [...prev, { id: effectId, position }]);
          queueAnimationTimeout(() => {
            setCollisionEffects((prev) =>
              prev.filter((entry) => entry.id !== effectId),
            );
          }, 520);
        }
      }

      if (event.skillId === "aurora_heal") {
        if (!isSfxMuted) {
          playHealing(sfxVolume);
        }
        for (const heal of event.heals ?? []) {
          const healedHeartIndex = Math.max(0, heal.newHp - 1);
          setState((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              players: {
                ...prev.players,
                [heal.color]: {
                  ...prev.players[heal.color],
                  hp: heal.newHp,
                },
              },
            };
          });
          triggerHealEffect(heal.color, heal.position, healedHeartIndex);
        }
      }

      if (event.skillId === "electric_blitz") {
        if (!isSfxMuted) {
          playBlitz(sfxVolume);
        }
        setMovingBlitzProgress((prev) => ({ ...prev, [event.color]: 0 }));
        for (const position of event.affectedPositions ?? []) {
          const effectId = Date.now() + Math.random();
          setCollisionEffects((prev) => [...prev, { id: effectId, position }]);
          queueAnimationTimeout(() => {
            setCollisionEffects((prev) =>
              prev.filter((entry) => entry.id !== effectId),
            );
          }, 220);
        }
        const dashPositions = (event.affectedPositions ?? []).slice(1);
        dashPositions.forEach((position, index) => {
          queueAnimationTimeout(
            () => {
              if (event.color === "red") setRedDisplayPos(position);
              else setBlueDisplayPos(position);
              setMovingBlitzProgress((prev) => ({
                ...prev,
                [event.color]: index + 1,
              }));
            },
            (index + 1) * BLITZ_DASH_STEP_MS,
          );
        });
        const eventDuration = Math.max(
          120,
          dashPositions.length * BLITZ_DASH_STEP_MS + 24,
        );
        for (const damage of event.damages ?? []) {
          setState((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              players: {
                ...prev.players,
                [damage.color]: {
                  ...prev.players[damage.color],
                  hp: damage.newHp,
                },
              },
            };
          });
          triggerLocalHit(damage.color, damage.newHp, damage.position);
        }
        queueAnimationTimeout(() => {
          setAbilityBanner(null);
          done();
        }, eventDuration);
        return;
      }

      if (event.skillId === "cosmic_bigbang") {
        if (!isSfxMuted) {
          playBigBang(sfxVolume);
        }
        const origin = stateRef.current?.players[event.color].position;
        const wavePositions = [...(event.affectedPositions ?? [])].sort(
          (left, right) => {
            const leftDistance = origin
              ? Math.max(
                  Math.abs(left.row - origin.row),
                  Math.abs(left.col - origin.col),
                )
              : 0;
            const rightDistance = origin
              ? Math.max(
                  Math.abs(right.row - origin.row),
                  Math.abs(right.col - origin.col),
                )
              : 0;
            return leftDistance - rightDistance;
          },
        );

        const waves = new Map<number, Position[]>();
        for (const position of wavePositions) {
          const distance = origin
            ? Math.max(
                Math.abs(position.row - origin.row),
                Math.abs(position.col - origin.col),
              )
            : 0;
          const list = waves.get(distance) ?? [];
          list.push(position);
          waves.set(distance, list);
        }

        for (const [distance, positions] of waves.entries()) {
          queueAnimationTimeout(() => {
            for (const position of positions) {
              const effectId = Date.now() + Math.random();
              setCollisionEffects((prev) => [
                ...prev,
                { id: effectId, position },
              ]);
              queueAnimationTimeout(() => {
                setCollisionEffects((prev) =>
                  prev.filter((entry) => entry.id !== effectId),
                );
              }, 420);
            }
          }, distance * 80);
        }
        for (const damage of event.damages ?? []) {
          setState((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              players: {
                ...prev.players,
                [damage.color]: {
                  ...prev.players[damage.color],
                  hp: damage.newHp,
                },
              },
            };
          });
          triggerLocalHit(damage.color, damage.newHp, damage.position);
        }
        queueAnimationTimeout(() => {
          setAbilityBanner(null);
          done();
        }, SKILL_PAUSE_MS);
        return;
      }

      if (event.skillId === "quantum_shift" && event.to) {
        const target = event.to;
        const fallbackFrom =
          event.color === "red"
            ? stateRef.current?.players.red.position
            : stateRef.current?.players.blue.position;
        if (!isSfxMuted) {
          playQuantum(sfxVolume);
        }
        triggerTeleportEffect(
          event.color,
          event.from ?? fallbackFrom ?? target,
          target,
        );
        queueAnimationTimeout(() => {
          if (event.color === "red") setRedDisplayPos(target);
          else setBlueDisplayPos(target);
        }, 120);
      }

      if (event.skillId === "atomic_fission") {
        setMovingAtomicClones((prev) => ({
          ...prev,
          [event.color]: {
            ...prev[event.color],
            position: event.cloneStart ?? null,
          },
        }));
      }

      for (const damage of event.damages ?? []) {
        setState((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            players: {
              ...prev.players,
              [damage.color]: {
                ...prev.players[damage.color],
                hp: damage.newHp,
              },
            },
          };
        });
        triggerLocalHit(damage.color, damage.newHp, damage.position);
      }

      queueAnimationTimeout(() => {
        setAbilityBanner(null);
        done();
      }, SKILL_PAUSE_MS);
    }, SKILL_CAST_DELAY_MS);
  };

  const runAnimation = (
    payload: AbilityResolutionPayload,
    initialRevealPauseMs = 0,
  ) => {
    clearAnimationTimeouts();
    const blitzColors: BoolByColor = {
      red: payload.skillEvents.some(
        (event) => event.skillId === "electric_blitz" && event.color === "red",
      ),
      blue: payload.skillEvents.some(
        (event) => event.skillId === "electric_blitz" && event.color === "blue",
      ),
    };
    const blitzSteps: NullableNumberByColor = {
      red:
        payload.skillEvents.find(
          (event) =>
            event.skillId === "electric_blitz" && event.color === "red",
        )?.step ?? null,
      blue:
        payload.skillEvents.find(
          (event) =>
            event.skillId === "electric_blitz" && event.color === "blue",
        )?.step ?? null,
    };
    const atomicCloneEvents = {
      red:
        payload.skillEvents.find(
          (event) =>
            event.skillId === "atomic_fission" &&
            event.color === "red" &&
            event.cloneStart,
        ) ?? null,
      blue:
        payload.skillEvents.find(
          (event) =>
            event.skillId === "atomic_fission" &&
            event.color === "blue" &&
            event.cloneStart,
        ) ?? null,
    };
    const atomicCloneVisuals: AtomicCloneVisualsByColor = {
      red: {
        start: atomicCloneEvents.red?.cloneStart ?? null,
        path: atomicCloneEvents.red?.clonePath ?? [],
        step: atomicCloneEvents.red?.step ?? null,
        position: null,
      },
      blue: {
        start: atomicCloneEvents.blue?.cloneStart ?? null,
        path: atomicCloneEvents.blue?.clonePath ?? [],
        step: atomicCloneEvents.blue?.step ?? null,
        position: null,
      },
    };
    const teleportMarkers: NullablePositionByColor = {
      red:
        payload.skillEvents.find(
          (event) =>
            event.color === "red" &&
            event.skillId === "quantum_shift" &&
            event.to,
        )?.to ?? null,
      blue:
        payload.skillEvents.find(
          (event) =>
            event.color === "blue" &&
            event.skillId === "quantum_shift" &&
            event.to,
        )?.to ?? null,
    };
    const movingTeleportSteps: NullableNumberByColor = {
      red:
        payload.skillEvents.find(
          (event) =>
            event.color === "red" &&
            event.skillId === "quantum_shift" &&
            event.to,
        )?.step ?? null,
      blue:
        payload.skillEvents.find(
          (event) =>
            event.color === "blue" &&
            event.skillId === "quantum_shift" &&
            event.to,
        )?.step ?? null,
    };
    const teleportSteps = movingTeleportSteps;
    const redVisualStart =
      teleportSteps.red === 0 && teleportMarkers.red
        ? teleportMarkers.red
        : payload.redStart;
    const blueVisualStart =
      teleportSteps.blue === 0 && teleportMarkers.blue
        ? teleportMarkers.blue
        : payload.blueStart;
    const nextMovingStarts: PositionByColor = {
      red: redVisualStart,
      blue: blueVisualStart,
    };
    const guardCounters = {
      red: stateRef.current?.players.red.invulnerableSteps ?? 0,
      blue: stateRef.current?.players.blue.invulnerableSteps ?? 0,
    };
    const atFieldCounters = {
      red: 0,
      blue: 0,
    };
    const phaseShiftFlags: BoolByColor = {
      red: payload.skillEvents.some(
        (event) => event.skillId === "phase_shift" && event.color === "red",
      ),
      blue: payload.skillEvents.some(
        (event) => event.skillId === "phase_shift" && event.color === "blue",
      ),
    };
    applyMovingPayloadState(
      payload,
      phaseShiftFlags,
      nextMovingStarts,
      teleportMarkers,
      movingTeleportSteps,
      blitzColors,
      blitzSteps,
      atomicCloneVisuals,
    );

    const skillMap = collectSkillEventsByStep(payload.skillEvents);
    const blockMap = collectBlocksByStep(payload.blocks);
    const collisionMap = collectCollisionsByStep(payload.collisions);

    const redSeq = [redVisualStart, ...payload.redPath];
    const blueSeq = [blueVisualStart, ...payload.bluePath];
    const maxSteps = Math.max(redSeq.length - 1, blueSeq.length - 1);

    const getVisualPositionForStep = (
      color: PlayerColor,
      step: number,
      seq: Position[],
      path: Position[],
    ) => {
      const teleportStep =
        color === "red" ? teleportSteps.red : teleportSteps.blue;
      const teleportTarget =
        color === "red" ? teleportMarkers.red : teleportMarkers.blue;

      if (teleportStep === null || !teleportTarget) {
        return seq[Math.min(step, seq.length - 1)];
      }

      if (step <= teleportStep) {
        return seq[Math.min(step, seq.length - 1)];
      }

      if (step < seq.length) {
        return seq[step];
      }

      const finalPosition =
        path.length === teleportStep ? teleportTarget : seq[seq.length - 1];
      return finalPosition;
    };

    const runSkillQueue = (
      events: AbilityResolutionPayload["skillEvents"],
      index: number,
      done: () => void,
    ) => {
      if (index >= events.length) {
        done();
        return;
      }
      runSkillEvent(events[index], () =>
        runSkillQueue(events, index + 1, done),
      );
    };

    const applyCollision = (
      collision: AbilityResolutionPayload["collisions"][number],
    ) => {
      setState((prev) => {
        if (!prev) return prev;
        const currentHp = prev.players[collision.escapeeColor].hp;
        return {
          ...prev,
          players: {
            ...prev.players,
            [collision.escapeeColor]: {
              ...prev.players[collision.escapeeColor],
              hp: Math.min(currentHp, collision.newHp),
            },
          },
        };
      });
      triggerLocalHit(
        collision.escapeeColor,
        collision.newHp,
        collision.position,
      );
    };

    const applyCollisions = (
      collisions: AbilityResolutionPayload["collisions"],
    ) => {
      for (const collision of collisions) {
        applyCollision(collision);
      }
    };

    const syncPersistentDefenseVisuals = () => {
      setActiveGuards({
        red: guardCounters.red > 0,
        blue: guardCounters.blue > 0,
      });
      setActiveAtFields({
        red: atFieldCounters.red > 0,
        blue: atFieldCounters.blue > 0,
      });
    };

    const consumeDefenseVisualStep = () => {
      const endedGuards: PlayerColor[] = [];
      const endedAtFields: PlayerColor[] = [];

      if (guardCounters.red === 1) endedGuards.push("red");
      if (guardCounters.blue === 1) endedGuards.push("blue");
      if (atFieldCounters.red === 1) endedAtFields.push("red");
      if (atFieldCounters.blue === 1) endedAtFields.push("blue");

      if (guardCounters.red > 0) guardCounters.red -= 1;
      if (guardCounters.blue > 0) guardCounters.blue -= 1;
      if (atFieldCounters.red > 0) atFieldCounters.red -= 1;
      if (atFieldCounters.blue > 0) atFieldCounters.blue -= 1;

      syncPersistentDefenseVisuals();

      return { endedGuards, endedAtFields };
    };

    const runGuardEndNotice = (
      endedColors: PlayerColor[],
      done: () => void,
    ) => {
      if (endedColors.length === 0) {
        done();
        return;
      }
      const bannerText =
        endedColors.length > 1
          ? lang === "en"
            ? "Both · Guard Ended"
            : "양측 · 가드 종료"
          : endedColors[0] === currentColor
            ? lang === "en"
              ? "You · Guard Ended"
              : "내 말 · 가드 종료"
            : lang === "en"
              ? "Enemy · Guard Ended"
              : "상대 · 가드 종료";
      setAbilityBanner(bannerText);
      queueAnimationTimeout(() => {
        setAbilityBanner(null);
        done();
      }, GUARD_END_PAUSE_MS);
    };

    const runAtFieldEndNotice = (
      endedColors: PlayerColor[],
      done: () => void,
    ) => {
      if (endedColors.length === 0) {
        done();
        return;
      }
      const bannerText =
        endedColors.length > 1
          ? lang === "en"
            ? "Both · AT Field Ended"
            : "양측 · AT 필드 종료"
          : endedColors[0] === currentColor
            ? lang === "en"
              ? "You · AT Field Ended"
              : "내 말 · AT 필드 종료"
            : lang === "en"
              ? "Enemy · AT Field Ended"
              : "상대 · AT 필드 종료";
      setAbilityBanner(bannerText);
      queueAnimationTimeout(() => {
        setAbilityBanner(null);
        done();
      }, AT_FIELD_END_PAUSE_MS);
    };

    const finalizeEndNotices = () => {
      const { endedGuards, endedAtFields } = consumeDefenseVisualStep();

      runGuardEndNotice(endedGuards, () =>
        runAtFieldEndNotice(endedAtFields, () => undefined),
      );
    };

    const applyPersistentSkillCounters = (
      events: AbilityResolutionPayload["skillEvents"],
    ) => {
      for (const event of events) {
        if (event.skillId === "classic_guard" && event.invulnerableSteps) {
          guardCounters[event.color] = Math.max(
            guardCounters[event.color],
            event.invulnerableSteps,
          );
        }
        if (event.skillId === "arc_reactor_field") {
          atFieldCounters[event.color] = Math.max(
            atFieldCounters[event.color],
            AT_FIELD_VISUAL_STEPS,
          );
        }
      }
      syncPersistentDefenseVisuals();
    };

    const runStepEventsAndCollisions = (step: number, done: () => void) => {
      const events = skillMap.get(step) ?? [];
      const blocks = blockMap.get(step) ?? [];
      const collisions = collisionMap.get(step) ?? [];

      if (events.length === 0) {
        if (blocks.length > 0 && !isSfxMuted) {
          playShieldBlock(sfxVolume);
        }
        if (collisions.length > 0) {
          applyCollisions(collisions);
        }
        done();
        return;
      }

      const hasBlitzEvent = events.some(
        (event) => event.skillId === "electric_blitz",
      );

      const runStepSkills = () => {
        runSkillQueue(events, 0, () => {
          applyPersistentSkillCounters(events);
          if (blocks.length > 0 && !isSfxMuted) {
            playShieldBlock(sfxVolume);
          }
          if (hasBlitzEvent && step < maxSteps) {
            queueAnimationTimeout(done, BLITZ_POST_HIT_PAUSE_MS);
            return;
          }
          done();
        });
      };

      if (collisions.length > 0) {
        applyCollisions(collisions);
        queueAnimationTimeout(runStepSkills, HIT_VISUAL_DELAY_MS + 80);
        return;
      }

      runStepSkills();
    };

    const advance = (step: number) => {
      if (step === 0) {
        runStepEventsAndCollisions(0, () => advance(1));
        return;
      }

      if (step > maxSteps) {
        finalizeEndNotices();
        return;
      }

      const redShouldMoveNormally =
        !blitzColors.red || step <= (blitzSteps.red ?? -1);
      const blueShouldMoveNormally =
        !blitzColors.blue || step <= (blitzSteps.blue ?? -1);

      setMovingAtomicClones((prev) => ({
        red: {
          ...prev.red,
          position: getClonePositionForStep(
            prev.red.start,
            prev.red.path,
            prev.red.step,
            step,
          ),
        },
        blue: {
          ...prev.blue,
          position: getClonePositionForStep(
            prev.blue.start,
            prev.blue.path,
            prev.blue.step,
            step,
          ),
        },
      }));

      if (redShouldMoveNormally) {
        setRedDisplayPos(
          getVisualPositionForStep("red", step, redSeq, payload.redPath),
        );
      }
      if (blueShouldMoveNormally) {
        setBlueDisplayPos(
          getVisualPositionForStep("blue", step, blueSeq, payload.bluePath),
        );
      }

      queueAnimationTimeout(() => {
        const { endedGuards, endedAtFields } = consumeDefenseVisualStep();

        const continueStep = () => {
          runStepEventsAndCollisions(step, () => advance(step + 1));
        };

        runGuardEndNotice(endedGuards, () =>
          runAtFieldEndNotice(endedAtFields, continueStep),
        );
      }, STEP_DURATION_MS);
    };

    if (initialRevealPauseMs > 0) {
      queueAnimationTimeout(() => advance(0), initialRevealPauseMs);
      return;
    }
    advance(0);
  };

  useEffect(() => {
    const socket = getSocket();

    const onGameStart = (nextState: AbilityBattleState) => {
      setRoundInfo(null);
      resetPlanningState();
      applyState(nextState);
    };

    const onRoundStart = (payload: AbilityRoundStartPayload) => {
      void syncServerTime(socket);
      const previousState = stateRef.current;
      const nextState = payload.state;
      const voidCloakTriggered =
        (!!nextState.players.red.hidden &&
          (!previousState?.players.red.hidden ||
            previousState.players.red.position.row !==
              nextState.players.red.position.row ||
            previousState.players.red.position.col !==
              nextState.players.red.position.col)) ||
        (!!nextState.players.blue.hidden &&
          (!previousState?.players.blue.hidden ||
            previousState.players.blue.position.row !==
              nextState.players.blue.position.row ||
            previousState.players.blue.position.col !==
              nextState.players.blue.position.col));
      if (voidCloakTriggered && !isSfxMuted) {
        playVoidCloak(sfxVolume);
      }
      setRoundInfo(payload);
      resetPlanningState();
      applyState(nextState);
    };

    const onRoomJoined = ({
      roomId,
      color,
    }: {
      roomId: string;
      color: PlayerColor;
    }) => {
      setMyColor(color);
      setRoomCode(roomId);
      socket.emit("ability_client_ready");
    };

    const onPlanUpdated = ({
      color,
    }: {
      color: PlayerColor;
      path: Position[];
      skills: AbilitySkillReservation[];
    }) => {
      if (color === currentColor) return;
    };

    const onOpponentSubmitted = () => {
      setOpponentSubmitted(true);
    };

    const onPlayerSubmitted = ({
      color,
      path,
      skills,
    }: {
      color: PlayerColor;
      path: Position[];
      skills: AbilitySkillReservation[];
    }) => {
      if (color === currentColor) {
        setMyPath(path);
        setSkillReservations(skills);
        setMySubmitted(true);
        return;
      }
      setOpponentSubmitted(true);
    };

    const onResolution = (payload: AbilityResolutionPayload) => {
      setRoundInfo(null);
      const hadHiddenPlayer =
        !!stateRef.current &&
        (stateRef.current.players.red.hidden ||
          stateRef.current.players.blue.hidden);
      const nextState = stateRef.current
        ? {
            ...stateRef.current,
            phase: "moving" as const,
            lavaTiles: payload.lavaTiles,
            players: {
              ...stateRef.current.players,
              red: { ...stateRef.current.players.red, hidden: false },
              blue: { ...stateRef.current.players.blue, hidden: false },
            },
          }
        : null;
      if (nextState) {
        stateRef.current = nextState;
        setState(nextState);
      }
      runAnimation(payload, hadHiddenPlayer ? VOID_REVEAL_PAUSE_MS : 0);
    };

    const onGameOver = ({
      winner: nextWinner,
    }: {
      winner: PlayerColor | "draw";
    }) => {
      setWinner(nextWinner);
      setState((prev) => (prev ? { ...prev, phase: "gameover" } : prev));
    };

    const onOpponentDisconnected = () => {
      setWinner(currentColor);
      setGameOverMessage(
        lang === "en"
          ? "The opponent disconnected."
          : "상대가 연결을 끊었습니다.",
      );
      setState((prev) => (prev ? { ...prev, phase: "gameover" } : prev));
    };

    const onRematchRequested = () => {
      setRematchRequested(true);
    };

    socket.on("ability_game_start", onGameStart);
    socket.on("ability_round_start", onRoundStart);
    socket.on("ability_room_joined", onRoomJoined);
    socket.on("ability_plan_updated", onPlanUpdated);
    socket.on("ability_opponent_submitted", onOpponentSubmitted);
    socket.on("ability_player_submitted", onPlayerSubmitted);
    socket.on("ability_resolution", onResolution);
    socket.on("ability_game_over", onGameOver);
    socket.on("opponent_disconnected", onOpponentDisconnected);
    socket.on("rematch_requested", onRematchRequested);
    socket.emit("ability_client_ready");

    return () => {
      clearAnimationTimeouts();
      clearSubmitTimeouts();
      socket.off("ability_game_start", onGameStart);
      socket.off("ability_round_start", onRoundStart);
      socket.off("ability_room_joined", onRoomJoined);
      socket.off("ability_plan_updated", onPlanUpdated);
      socket.off("ability_opponent_submitted", onOpponentSubmitted);
      socket.off("ability_player_submitted", onPlayerSubmitted);
      socket.off("ability_resolution", onResolution);
      socket.off("ability_game_over", onGameOver);
      socket.off("opponent_disconnected", onOpponentDisconnected);
      socket.off("rematch_requested", onRematchRequested);
    };
  }, [
    currentColor,
    isSfxMuted,
    lang,
    setMyColor,
    setRematchRequestSent,
    setRoomCode,
    sfxVolume,
  ]);

  useEffect(() => {
    if (!state || state.phase !== "planning" || mySubmitted || !roundInfo)
      return;
    const socket = getSocket();
    const submitCurrentPlan = () => {
      const latest = stateRef.current;
      if (!latest || latest.phase !== "planning") return;
      if (latest.players[currentColor].pathSubmitted) return;
      socket.emit(
        "ability_submit_plan",
        { path: myPath, skills: skillReservations },
        ({
          ok,
          acceptedPath,
          acceptedSkills,
        }: {
          ok: boolean;
          acceptedPath: Position[];
          acceptedSkills: AbilitySkillReservation[];
        }) => {
          if (!ok) return;
          setMyPath(acceptedPath);
          setSkillReservations(acceptedSkills);
          setMySubmitted(true);
        },
      );
    };

    const preSubmitDelay = Math.max(
      0,
      roundInfo.roundEndsAt - getEstimatedServerNow() - 250,
    );
    const finalSubmitDelay = Math.max(
      0,
      roundInfo.roundEndsAt - getEstimatedServerNow(),
    );

    queueSubmitTimeout(submitCurrentPlan, preSubmitDelay);
    queueSubmitTimeout(submitCurrentPlan, finalSubmitDelay);

    return () => {
      clearSubmitTimeouts();
    };
  }, [currentColor, myPath, mySubmitted, roundInfo, skillReservations, state]);

  if (!state) {
    return (
      <div className="gs-loading">
        {lang === "en" ? "Loading ability battle..." : "능력 대전 로딩 중..."}
      </div>
    );
  }

  const me = state.players[currentColor];
  const opponent = state.players[opponentColor];
  const resolvedBoardSkin: BoardSkin =
    state.players.red.boardSkin !== "classic"
      ? state.players.red.boardSkin
      : state.players.blue.boardSkin !== "classic"
        ? state.players.blue.boardSkin
        : boardSkin;
  const screenBoardClass =
    resolvedBoardSkin === "pharaoh"
      ? "board-bg-pharaoh-screen"
      : resolvedBoardSkin === "magic"
        ? "board-bg-magic-screen"
        : "";
  const overdriveTurn = me.overdriveActive;
  const effectivePathPoints = me.reboundLocked ? 0 : state.pathPoints;
  const rewardTokens =
    winner && winner === currentColor
      ? Math.min(6, Math.max(0, 120 - accountDailyRewardTokens))
      : 0;
  const isPlanning = state.phase === "planning";
  const previewStart = getPreviewStart();
  const previewAtomicClone =
    atomicReservation &&
    state.players[currentColor].previousTurnStart &&
    state.players[currentColor].previousTurnPath.length > 0
      ? {
          color: currentColor,
          start: state.players[currentColor].previousTurnStart,
          path: state.players[currentColor].previousTurnPath,
          step: atomicReservation.step,
        }
      : null;
  const canDrawPath =
    isPlanning &&
    effectivePathPoints > 0 &&
    !mySubmitted &&
    (overdriveTurn ||
      !skillReservations.some(
        (reservation) =>
          reservation.skillId === "classic_guard" ||
          reservation.skillId === "plasma_charge" ||
          reservation.skillId === "electric_blitz" ||
          reservation.skillId === "cosmic_bigbang",
      ));

  const handleRematch = () => {
    getSocket().emit("request_rematch");
    setRematchRequestSent(true);
  };

  const handleSkillPressStart = (skillId: AbilitySkillId) => {
    clearSkillPressTimeout();
    longPressTriggeredRef.current = false;
    skillPressTimeoutRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true;
      setMySkillInfo(skillId);
      skillPressTimeoutRef.current = null;
    }, 380);
  };

  const handleSkillPressEnd = () => {
    clearSkillPressTimeout();
  };

  return (
    <div
      className={`game-screen ability-screen ${screenBoardClass}`}
      style={{ "--gs-scale": scale } as CSSProperties}
    >
      <div className="gs-utility-bar">
        <div className="gs-timer-slot">
          {state.phase === "planning" && roundInfo && (
            <TimerBar
              duration={roundInfo.timeLimit}
              roundEndsAt={roundInfo.roundEndsAt}
            />
          )}
          {state.phase === "moving" && (
            <div className="gs-phase-moving">
              <span className="gs-moving-pip" />
              {lang === "en" ? "Resolving" : "해결 중"}
            </div>
          )}
        </div>
        <div className="gs-utility-buttons">
          <button className="gs-lobby-btn" onClick={onLeaveToLobby}>
            Lobby
          </button>
        </div>
      </div>

      <div className="gs-board-stage">
        {winner && (
          <div className="gs-result-slot">
            <div className="gameover-overlay">
              <div className="gameover-box">
                <div className="ability-gameover-opponent">
                  <PlayerInfo player={opponent} isMe={false} />
                </div>
                <div
                  className={`gameover-result ${winner === currentColor ? "win" : "lose"}`}
                >
                  {winner === "draw"
                    ? lang === "en"
                      ? "Draw"
                      : "무승부"
                    : winner === currentColor
                      ? lang === "en"
                        ? "YOU WIN!"
                        : "승리"
                      : lang === "en"
                        ? "YOU LOSE"
                        : "패배"}
                </div>
                {gameOverMessage && (
                  <div className="gameover-message">{gameOverMessage}</div>
                )}
                {winner === currentColor && rewardTokens > 0 && (
                  <div className="gameover-reward">
                    {lang === "en"
                      ? `+${rewardTokens} Tokens`
                      : `+${rewardTokens} 토큰 획득`}
                  </div>
                )}
                {rematchRequested && (
                  <div className="rematch-notice">
                    {lang === "en"
                      ? "Opponent requested rematch."
                      : "상대가 재도전을 요청했습니다."}
                  </div>
                )}
                {rematchRequestSent && (
                  <div className="rematch-notice">
                    {lang === "en"
                      ? "Rematch request sent."
                      : "재도전 요청을 보냈습니다."}
                  </div>
                )}
                {!gameOverMessage && (
                  <button className="rematch-btn" onClick={handleRematch}>
                    {lang === "en" ? "REMATCH" : "재도전"}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {abilityBanner && <div className="ability-banner">{abilityBanner}</div>}

        <div className="gs-path-bar ability-path-bar">
          <div
            className={`gs-role-badge gs-role-badge-self gs-role-badge-${me.role === "attacker" ? "atk" : "run"} ability-path-role`}
          >
            <span className="gs-role-icon">
              {me.role === "attacker" ? "ATK" : "RUN"}
            </span>
            <span className="gs-role-label">
              {me.role === "attacker"
                ? lang === "en"
                  ? "Attack"
                  : "공격"
                : lang === "en"
                  ? "Escape"
                  : "도망"}
            </span>
          </div>
          <div className="ability-path-points">
            <div className="gs-path-header">
              <span className="gs-path-label">
                {lang === "en" ? "Path Points" : "경로 포인트"}
              </span>
              <span className="gs-path-count">
                <span className="gs-path-current">{myPath.length}</span>
                <span className="gs-path-sep"> / </span>
                <span className="gs-path-max">{effectivePathPoints}</span>
              </span>
            </div>
            <div className="gs-path-gauge">
              {Array.from({ length: effectivePathPoints }, (_, index) => (
                <div
                  key={index}
                  className={`gs-path-seg${index < myPath.length ? " filled" : ""}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="ability-opponent-panel">
          <div className="ability-opponent-panel-name">
            <span className="ability-opponent-panel-label">
              {lang === "en" ? "Opponent" : "상대"}
            </span>
            <PlayerInfo player={opponent} isMe={false} />
          </div>
          <div className="ability-opponent-panel-skills">
            {opponent.equippedSkills.map((skillId) => {
              const skill = ABILITY_SKILLS[skillId];
              return (
                <div key={skillId} className="ability-opponent-panel-skill">
                  <span className="ability-opponent-panel-skill-icon">
                    {renderSkillIcon(skillId)}
                  </span>
                  <span className="ability-opponent-panel-skill-name">
                    {lang === "en" ? skill.name.en : skill.name.kr}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="gs-grid-area" ref={gridAreaRef}>
          <AbilityGrid
            state={state}
            currentColor={currentColor}
            pathPoints={effectivePathPoints}
            myPath={myPath}
            setMyPath={updateMyPath}
            displayPositions={{ red: redDisplayPos, blue: blueDisplayPos }}
            hitFlags={hitFlags}
            explodingFlags={explodingFlags}
            collisionEffects={collisionEffects}
            teleportEffects={teleportEffects}
            chargeEffects={chargeEffects}
            healEffects={healEffects}
            activeGuards={activeGuards}
            activeAtFields={activeAtFields}
            activePhaseShifts={activePhaseShifts}
            previewStart={previewStart}
            previewAtomicClone={previewAtomicClone}
            teleportReservation={teleportReservation}
            teleportMarker={
              state.phase === "moving"
                ? movingTeleportMarkers[currentColor]
                : (teleportReservation?.target ?? null)
            }
            infernoMarker={infernoReservation?.target ?? null}
            movingTeleportMarkers={movingTeleportMarkers}
            movingTeleportSteps={movingTeleportSteps}
            movingBlitzColors={movingBlitzColors}
            movingBlitzProgress={movingBlitzProgress}
            movingBlitzSteps={movingBlitzSteps}
            movingAtomicClones={movingAtomicClones}
            movingPaths={movingPaths}
            movingStarts={movingStarts}
            cellSize={cellSize}
            isPlanning={state.phase === "planning"}
            canEditPath={canDrawPath}
            teleportTargetsVisible={pendingTeleport}
            blitzTargetsVisible={pendingBlitz}
            infernoTargetsVisible={
              pendingInferno && selectedSkillId === "inferno_field"
            }
            onTeleportTargetSelect={handleTeleportTargetSelect}
            onBlitzTargetSelect={handleBlitzTargetSelect}
            onInfernoTargetSelect={handleInfernoTargetSelect}
            onTeleportCancel={handleTeleportCancel}
          />
        </div>
      </div>

      <div className="ability-skill-panel">
        <div className="ability-skill-panel-head">
          <strong>{lang === "en" ? "Skills" : "스킬"}</strong>
          <div className="ability-reservation-strip">
            {skillReservations.map((reservation) => {
              const skill = ABILITY_SKILLS[reservation.skillId];
              return (
                <button
                  key={`${reservation.skillId}-${reservation.order}`}
                  type="button"
                  className="ability-reservation-chip"
                  onClick={() => removeReservation(reservation.skillId)}
                >
                  {renderSkillIcon(reservation.skillId)}
                  <span>{lang === "en" ? skill.name.en : skill.name.kr}</span>
                  <span>
                    {lang === "en"
                      ? `step ${reservation.step}`
                      : `${reservation.step}칸`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        {mySkillInfo && (
          <div className="ability-skill-tooltip ability-skill-tooltip-self">
            <strong>
              {lang === "en"
                ? ABILITY_SKILLS[mySkillInfo].name.en
                : ABILITY_SKILLS[mySkillInfo].name.kr}
            </strong>
            <span>
              {lang === "en"
                ? ABILITY_SKILLS[mySkillInfo].description.en
                : ABILITY_SKILLS[mySkillInfo].description.kr}
            </span>
          </div>
        )}
        <div className="ability-skill-buttons">
          {getAvailableSkills().map((skillId) => {
            const skill = ABILITY_SKILLS[skillId];
            const reserved = skillReservations.some(
              (entry) => entry.skillId === skillId,
            );
            const blitzReserved = skillReservations.some(
              (entry) => entry.skillId === "electric_blitz",
            );
            const bigBangReserved = skillReservations.some(
              (entry) => entry.skillId === "cosmic_bigbang",
            );
            const roleBlocked =
              ((skillId === "classic_guard" ||
                skillId === "gold_overdrive" ||
                skillId === "phase_shift" ||
                skillId === "arc_reactor_field") &&
                getMyRole() !== "escaper") ||
              ((skillId === "ember_blast" ||
                skillId === "atomic_fission" ||
                skillId === "inferno_field" ||
                skillId === "nova_blast" ||
                skillId === "electric_blitz" ||
                skillId === "cosmic_bigbang") &&
                getMyRole() !== "attacker");
            const atomicUnavailable =
              skillId === "atomic_fission" &&
              (!me.previousTurnStart || me.previousTurnPath.length === 0);
            const blitzBlocked = !overdriveTurn && blitzReserved && !reserved;
            const bigBangBlocked =
              !overdriveTurn && bigBangReserved && !reserved;
            const disabled =
              !isPlanning ||
              mySubmitted ||
              roleBlocked ||
              atomicUnavailable ||
              blitzBlocked ||
              bigBangBlocked ||
              (getRemainingMana() < skill.manaCost && !reserved);
            return (
              <button
                key={skillId}
                type="button"
                className={`ability-skill-btn ${reserved ? "is-selected" : ""} ${selectedSkillId === skillId ? "is-active" : ""}`}
                disabled={disabled}
                onPointerDown={() => handleSkillPressStart(skillId)}
                onPointerUp={handleSkillPressEnd}
                onPointerLeave={handleSkillPressEnd}
                onPointerCancel={handleSkillPressEnd}
                onClick={() => {
                  if (longPressTriggeredRef.current) {
                    longPressTriggeredRef.current = false;
                    return;
                  }
                  if (!isSfxMuted) {
                    playLobbyClick(sfxVolume);
                  }
                  setMySkillInfo(null);
                  handleSkillClick(skillId);
                }}
              >
                <span className="ability-skill-icon">
                  {renderSkillIcon(skillId)}
                </span>
                <span className="ability-skill-name">
                  {lang === "en" ? skill.name.en : skill.name.kr}
                </span>
                <span className="ability-skill-cost">{skill.manaCost}</span>
              </button>
            );
          })}
        </div>
        <div className="gs-path-bar ability-mana-panel">
          <div className="gs-path-header">
            <span className="gs-path-label">
              {lang === "en" ? "Mana" : "마나"}
            </span>
            <span className="gs-path-count">
              <span className="gs-path-current">{getMyMana()}</span>
              <span className="gs-path-sep"> / </span>
              <span className="gs-path-max">10</span>
            </span>
          </div>
          <div className="gs-path-gauge">
            {Array.from({ length: 10 }, (_, index) => (
              <div
                key={index}
                className={`gs-path-seg ability-mana-seg${index < getMyMana() ? " filled" : ""}`}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
