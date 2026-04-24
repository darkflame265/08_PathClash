import { useCallback, useEffect, useRef, useState } from "react";
import ReactDOM from "react-dom";
import { getSocket } from "../../socket/socketClient";
import {
  connectLocalAbilityTrainingClient,
  getLocalAbilityTrainingSocket,
} from "../../ability/localTrainingSession";
import { syncServerTime, getEstimatedServerNow } from "../../socket/timeSync";
import { useLang } from "../../hooks/useLang";
import { useGameStore } from "../../store/gameStore";
import { TimerBar } from "../Game/TimerBar";
import { PlayerInfo } from "../Game/PlayerInfo";
import {
  playBigBang,
  playBlitz,
  playSunChariot,
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
  playMagicMine,
  playVoidCloak,
  playChronosTickTock,
  playPathStepClick,
  startChronosRewindLoop,
  stopChronosRewindLoop,
  playMatchResultSfx,
  startOverdriveLoop,
  startMatchResultBgm,
  stopOverdriveLoop,
  stopMatchResultBgm,
} from "../../utils/soundUtils";
import type {
  BoardSkin,
  PieceSkin,
  PlayerColor,
  Position,
} from "../../types/game.types";
import {
  ABILITY_SKILLS,
  type AbilityBattleState,
  type AbilityResolutionPayload,
  type AbilityRoundStartPayload,
  type AbilitySkillId,
  type AbilitySkillReservation,
  type AbilityTrapTile,
} from "../../types/ability.types";
import { AbilityGrid } from "./AbilityGrid";
import { isBlockedCell, isValidMove, posEqual } from "../../utils/pathUtils";
import {
  CONTROLS_SETTINGS_CHANGED_EVENT,
  loadControllerControlsSettings,
  loadKeyboardControlsSettings,
} from "../../settings/controls";
import "../Game/GameScreen.css";
import "../Game/GameGrid.css";
import "../Game/GameOverOverlay.css";
import "./AbilityScreen.css";
import "../Lobby/LobbyScreen.css";
import { useLobbyKeyboardNavigation } from "../Lobby/useLobbyKeyboardNavigation";

interface Props {
  onLeaveToLobby: () => void;
}

const MIN_CELL = 52;
const MAX_CELL = 160;
const STEP_DURATION_MS = 200;
const HIT_VISUAL_DELAY_MS = 0;
const SKILL_PAUSE_MS = 640;
const SKILL_CAST_DELAY_MS = 500;
const BLITZ_DASH_STEP_MS = 12;
const BLITZ_POST_HIT_PAUSE_MS = 640;
const VOID_REVEAL_PAUSE_MS = 450;
const AT_FIELD_VISUAL_STEPS = 2;
const GUARD_END_PAUSE_MS = 360;
const AT_FIELD_END_PAUSE_MS = 360;

const TRAINING_SKIN_ORDER: PieceSkin[] = [
  "classic",
  "ember",
  "nova",
  "aurora",
  "void",
  "plasma",
  "gold_core",
  "neon_pulse",
  "inferno",
  "quantum",
  "cosmic",
  "arc_reactor",
  "electric_core",
  "wizard",
  "chronos",
  "atomic",
  "sun",
  "flag_kr",
  "flag_jp",
  "flag_cn",
  "flag_us",
  "flag_uk",
];

const TRAINING_SKIN_ORDER_INDEX = new Map(
  TRAINING_SKIN_ORDER.map((skinId, index) => [skinId, index] as const),
);

const TRAINING_SKILL_ORDER_INDEX = new Map(
  Object.values(ABILITY_SKILLS).map(
    (skill, index) => [skill.id, index] as const,
  ),
);

const TRAINING_ABILITY_SKILLS = Object.values(ABILITY_SKILLS).sort(
  (left, right) => {
    const leftSkinOrder =
      TRAINING_SKIN_ORDER_INDEX.get(left.skinId) ?? Number.MAX_SAFE_INTEGER;
    const rightSkinOrder =
      TRAINING_SKIN_ORDER_INDEX.get(right.skinId) ?? Number.MAX_SAFE_INTEGER;

    if (leftSkinOrder !== rightSkinOrder) {
      return leftSkinOrder - rightSkinOrder;
    }

    return (
      (TRAINING_SKILL_ORDER_INDEX.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
      (TRAINING_SKILL_ORDER_INDEX.get(right.id) ?? Number.MAX_SAFE_INTEGER)
    );
  },
);
const TIME_REWIND_FREEZE_MS = 600;
const TIME_REWIND_HP_STEP_MS = 120;

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
    const visualStep =
      event.skillId === "wizard_magic_mine" &&
      (!event.damages || event.damages.length === 0)
        ? 0
        : event.step;
    const list = skillMap.get(visualStep) ?? [];
    list.push(event);
    skillMap.set(
      visualStep,
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
  const collisionMap = new Map<
    number,
    AbilityResolutionPayload["collisions"]
  >();
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
  if (skillId === "wizard_magic_mine") {
    return (
      <span
        className="ability-skill-icon-custom ability-skill-icon-magic-mine"
        aria-hidden="true"
      >
        <span className="ability-skill-icon-mine-ring ability-skill-icon-mine-ring-outer" />
        <span className="ability-skill-icon-mine-ring ability-skill-icon-mine-ring-inner" />
        <span className="ability-skill-icon-mine-rune" />
        <span className="ability-skill-icon-mine-orb" />
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
      : ABILITY_SKILLS[skillId].category === "passive"
        ? 3
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
    currentMatchType,
    isLocalAbilityTraining,
    rematchRequestSent,
    setRematchRequestSent,
    isSfxMuted,
    sfxVolume,
    triggerHeartShake,
    boardSkin,
  } = useGameStore();

  const [state, setState] = useState<AbilityBattleState | null>(null);
  const [showTrainingSkillSelect, setShowTrainingSkillSelect] = useState(false);
  const [trainingFloatingMessage, setTrainingFloatingMessage] = useState<{
    id: number;
    text: string;
  } | null>(null);
  const trainingFloatingMessageIdRef = useRef(0);
  const [trainingLoadout, setTrainingLoadout] = useState<AbilitySkillId[]>([]);
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
  const [keyboardControls, setKeyboardControls] = useState(
    loadKeyboardControlsSettings,
  );
  const [controllerControls, setControllerControls] = useState(
    loadControllerControlsSettings,
  );
  const [keyboardTarget, setKeyboardTarget] = useState<Position | null>(null);
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
  const [activeGuards, setActiveGuards] =
    useState<BoolByColor>(createFalseFlags);
  const [activeAtFields, setActiveAtFields] =
    useState<BoolByColor>(createFalseFlags);
  const [activePhaseShifts, setActivePhaseShifts] =
    useState<BoolByColor>(createFalseFlags);
  const [movingPaths, setMovingPaths] =
    useState<PathsByColor>(createEmptyPaths);
  const [movingStarts, setMovingStarts] = useState<PositionByColor | null>(
    null,
  );
  const [movingTeleportMarkers, setMovingTeleportMarkers] =
    useState<NullablePositionByColor>(createNullMarkers);
  const [movingTeleportSteps, setMovingTeleportSteps] =
    useState<NullableNumberByColor>(createNullSteps);
  const [movingBlitzColors, setMovingBlitzColors] =
    useState<BoolByColor>(createFalseFlags);
  const [movingBlitzProgress, setMovingBlitzProgress] =
    useState<NumberByColor>(createZeroCounters);
  const [movingBlitzSteps, setMovingBlitzSteps] =
    useState<NullableNumberByColor>(createNullSteps);
  const [activeSunChariots, setActiveSunChariots] =
    useState<BoolByColor>(createFalseFlags);
  const [transitionSunChariots, setTransitionSunChariots] =
    useState<BoolByColor>(createFalseFlags);
  const [movingAtomicClones, setMovingAtomicClones] =
    useState<AtomicCloneVisualsByColor>(createEmptyAtomicCloneVisuals);
  const [trapTiles, setTrapTiles] = useState<AbilityTrapTile[]>([]);
  const [pendingOwnedTriggeredTrapTiles, setPendingOwnedTriggeredTrapTiles] =
    useState<AbilityTrapTile[]>([]);
  const [magicMineCastingColors, setMagicMineCastingColors] = useState<{
    red: boolean;
    blue: boolean;
  }>({ red: false, blue: false });
  const [briefMineRevealPositions, setBriefMineRevealPositions] = useState<
    Array<{ id: number; position: Position }>
  >([]);
  const [winner, setWinner] = useState<PlayerColor | "draw" | null>(null);
  const [gameOverMessage, setGameOverMessage] = useState<string | null>(null);
  const [rematchRequested, setRematchRequested] = useState(false);
  const [abilityBanner, setAbilityBanner] = useState<string | null>(null);
  const [mySkillInfo, setMySkillInfo] = useState<AbilitySkillId | null>(null);
  const [timeRewindFocusColor, setTimeRewindFocusColor] =
    useState<PlayerColor | null>(null);
  const [rewindingPieceColor, setRewindingPieceColor] =
    useState<PlayerColor | null>(null);
  const resultAudioPlayedRef = useRef(false);
  const [connStatus, setConnStatus] = useState<"connected" | "reconnecting" | "failed">("connected");

  const getAbilitySocket = useCallback(
    () =>
      isLocalAbilityTraining
        ? getLocalAbilityTrainingSocket()
        : getSocket(),
    [isLocalAbilityTraining],
  );

  const stateRef = useRef<AbilityBattleState | null>(null);
  const applyStateRef = useRef<(s: AbilityBattleState) => void>((_s) => {});
  const winnerRef = useRef<PlayerColor | "draw" | null>(null);
  const skillReservationsRef = useRef<AbilitySkillReservation[]>([]);
  const animationTimeoutIdsRef = useRef<number[]>([]);
  const submitTimeoutIdsRef = useRef<number[]>([]);
  const initialReadySentRef = useRef(false);
  const gridAreaRef = useRef<HTMLDivElement>(null);
  const cellSize = useAdaptiveCellSize(gridAreaRef);
  const currentColor = myColor ?? "red";
  const opponentColor: PlayerColor = currentColor === "red" ? "blue" : "red";
  const planningSunChariots: BoolByColor = {
    red:
      state?.phase === "planning" &&
      currentColor === "red" &&
      skillReservations.some((entry) => entry.skillId === "sun_chariot"),
    blue:
      state?.phase === "planning" &&
      currentColor === "blue" &&
      skillReservations.some((entry) => entry.skillId === "sun_chariot"),
  };
  const visibleSunChariots: BoolByColor = {
    red:
      activeSunChariots.red ||
      planningSunChariots.red ||
      transitionSunChariots.red,
    blue:
      activeSunChariots.blue ||
      planningSunChariots.blue ||
      transitionSunChariots.blue,
  };
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
    winnerRef.current = winner;
  }, [winner]);

  useEffect(() => {
    skillReservationsRef.current = skillReservations;
  }, [skillReservations]);

  useEffect(() => {
    if (!state) return;
    if (state.phase === "planning") {
      setTransitionSunChariots(createFalseFlags());
      return;
    }
    if (state.phase !== "moving") {
      setTransitionSunChariots(createFalseFlags());
      return;
    }
    setTransitionSunChariots((prev) => ({
      red: activeSunChariots.red ? false : prev.red,
      blue: activeSunChariots.blue ? false : prev.blue,
    }));
  }, [activeSunChariots.blue, activeSunChariots.red, state]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);

  useEffect(() => {
    preloadAbilitySfxAssets();
    return () => {
      stopChronosRewindLoop();
    };
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
    if (!winner || winner === "draw") {
      resultAudioPlayedRef.current = false;
      stopMatchResultBgm();
      return;
    }

    if (resultAudioPlayedRef.current) return;

    const didWin = winner === currentColor;
    if (!isSfxMuted) {
      playMatchResultSfx(didWin ? "victory" : "defeat", sfxVolume);
    }
    startMatchResultBgm(didWin ? "victory" : "defeat");
    resultAudioPlayedRef.current = true;
  }, [currentColor, isSfxMuted, sfxVolume, winner]);

  useEffect(() => {
    return () => {
      stopMatchResultBgm();
    };
  }, []);

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
    setPendingOwnedTriggeredTrapTiles([]);
    setTimeRewindFocusColor(null);
    setRewindingPieceColor(null);
  };

  const resetMovingVisualState = () => {
    setMovingPaths(createEmptyPaths());
    setMovingStarts(null);
    setMovingTeleportMarkers(createNullMarkers());
    setMovingTeleportSteps(createNullSteps());
    setMovingBlitzColors(createFalseFlags());
    setMovingBlitzProgress(createZeroCounters());
    setMovingBlitzSteps(createNullSteps());
    setActiveSunChariots(createFalseFlags());
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
  applyStateRef.current = applyState;

  const getMyRole = () => state?.players[currentColor].role ?? "escaper";
  const getMyMana = () => state?.players[currentColor].mana ?? 0;
  const isOverdriveTurn = () => false;
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
  const handleTrainingSkillSelectClickCapture = (
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const clickable = target.closest("button, a");
    if (!(clickable instanceof HTMLElement)) return;
    if (clickable.hasAttribute("disabled")) return;
    if (clickable.getAttribute("aria-disabled") === "true") return;
    if (clickable instanceof HTMLAnchorElement && !clickable.href) return;

    if (!isSfxMuted) {
      playLobbyClick(sfxVolume);
    }
  };
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
    return myPath.length;
  };

  const getPreviewPositionAtStep = (step: number): Position => {
    const basePosition = state?.players[currentColor].position ?? {
      row: 2,
      col: 0,
    };
    const teleport = teleportReservation;

    if (!teleport?.target) {
      if (step <= 0) return basePosition;
      return myPath[step - 1] ?? basePosition;
    }

    if (teleport.step === 0) {
      if (step === 0) return teleport.target;
      return myPath[step - 1] ?? teleport.target;
    }

    if (step <= 0) return basePosition;
    if (step < teleport.step) return myPath[step - 1] ?? basePosition;
    if (step === teleport.step) return teleport.target;
    return myPath[step - 1] ?? teleport.target;
  };

  const previewWizardMineReservation =
    state?.phase === "planning"
      ? (skillReservations.find(
          (entry) => entry.skillId === "wizard_magic_mine",
        ) ?? null)
      : null;
  const previewWizardMineTile: AbilityTrapTile | null =
    previewWizardMineReservation
      ? {
          position: getPreviewPositionAtStep(previewWizardMineReservation.step),
          owner: currentColor,
          remainingTurns: 5,
        }
      : null;
  const baseTrapTiles =
    previewWizardMineTile &&
    !trapTiles.some(
      (trap) =>
        trap.owner === previewWizardMineTile.owner &&
        trap.position.row === previewWizardMineTile.position.row &&
        trap.position.col === previewWizardMineTile.position.col,
    )
      ? [...trapTiles, previewWizardMineTile]
      : trapTiles;
  const ownerVisibleTrapTiles = pendingOwnedTriggeredTrapTiles.reduce(
    (tiles, pendingTile) =>
      tiles.some(
        (tile) =>
          tile.owner === pendingTile.owner &&
          tile.position.row === pendingTile.position.row &&
          tile.position.col === pendingTile.position.col,
      )
        ? tiles
        : [...tiles, pendingTile],
    baseTrapTiles,
  );
  // 설치자: trapTiles에 있는 동안 항상 표시 (발동 시 setTrapTiles가 제거함)
  // 피격자: briefMineRevealPositions에 추가된 동안만 표시
  const visibleTrapTiles = [
    ...ownerVisibleTrapTiles,
    ...briefMineRevealPositions
      .filter(
        (rev) =>
          !ownerVisibleTrapTiles.some((t) =>
            posEqual(t.position, rev.position),
          ),
      )
      .map((rev) => ({
        position: rev.position,
        owner: currentColor,
        remainingTurns: 0,
      })),
  ];

  const updateMyPath = (nextPath: Position[]) => {
    const nextReservations = skillReservations.filter(
      (reservation) => reservation.step <= nextPath.length,
    );
    setMyPath(nextPath);
    if (nextReservations !== skillReservations) {
      setSkillReservations(nextReservations);
    }
  };

  const updateSkillReservations = (
    nextReservations: AbilitySkillReservation[],
  ) => {
    setSkillReservations(nextReservations);
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
      return;
    }

    if (skillId === "quantum_shift") {
      setMyPath(previousTeleportPathRef.current);
      setSkillReservations(nextReservations);
      return;
    }

    if (skillId === "electric_blitz") {
      setMyPath(previousBlitzPathRef.current);
      setSkillReservations(nextReservations);
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

  const beginSunChariotStepPick = () => {
    const alreadyReserved = skillReservations.some(
      (entry) => entry.skillId === "sun_chariot",
    );
    if (alreadyReserved) {
      removeReservation("sun_chariot");
      return;
    }
    if (getMyRole() !== "attacker") return;
    if (getRemainingMana() < getSkillCost("sun_chariot")) return;
    const nextReservations: AbilitySkillReservation[] = [
      ...skillReservations.filter((entry) => entry.skillId !== "sun_chariot"),
      {
        skillId: "sun_chariot",
        step: 0,
        order: reservationOrderRef.current++,
      },
    ];
    updateSkillReservations(nextReservations);
    setSelectedSkillId(null);
    setPendingTeleport(false);
  };

  const beginWizardMagicMineStepPick = () => {
    const alreadyReserved = skillReservations.some(
      (entry) => entry.skillId === "wizard_magic_mine",
    );
    if (alreadyReserved) {
      removeReservation("wizard_magic_mine");
      return;
    }
    if (getMyRole() !== "attacker") return;
    if (getRemainingMana() < getSkillCost("wizard_magic_mine")) return;
    const nextReservations: AbilitySkillReservation[] = [
      ...skillReservations.filter(
        (entry) => entry.skillId !== "wizard_magic_mine",
      ),
      {
        skillId: "wizard_magic_mine",
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
    if (!state) return;
    if (
      posEqual(target, state.players.red.position) ||
      posEqual(target, state.players.blue.position)
    ) {
      return;
    }
    const nextReservations: AbilitySkillReservation[] = [
      ...skillReservations.filter((entry) => entry.skillId !== "inferno_field"),
      {
        skillId: "inferno_field",
        step: 0,
        order: reservationOrderRef.current++,
        target,
      },
    ];
    setSkillReservations(nextReservations);
    setSelectedSkillId(null);
    setPendingInferno(false);
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
    if (!state) return;
    const opponentColor = currentColor === "red" ? "blue" : "red";
    const opponentPosition = state.players[opponentColor].position;
    const teleportOrigin =
      myPath.length > 0 ? myPath[myPath.length - 1] : state.players[currentColor].position;
    const rowDistance = Math.abs(target.row - teleportOrigin.row);
    const colDistance = Math.abs(target.col - teleportOrigin.col);
    if (
      (rowDistance === 0 && colDistance === 0) ||
      rowDistance > 1 ||
      colDistance > 1 ||
      posEqual(target, opponentPosition) ||
      isBlockedCell(target, state.obstacles)
    ) {
      return;
    }

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
      ...skillReservations.filter(
        (entry) => entry.skillId !== "electric_blitz",
      ),
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
    if (!isOverdriveTurn() && myPath.length >= 4) return;
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
  };

  const handleSkillClick = (skillId: AbilitySkillId) => {
    if (state?.phase !== "planning" || mySubmitted) return;
    if (skillId === "chronos_time_rewind") return;
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
    if (skillId === "sun_chariot") {
      beginSunChariotStepPick();
      return;
    }
    if (skillId === "wizard_magic_mine") {
      beginWizardMagicMineStepPick();
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

  const keyboardTargetMode = pendingTeleport
    ? "teleport"
    : pendingBlitz
      ? "blitz"
      : pendingInferno && selectedSkillId === "inferno_field"
        ? "inferno"
        : null;

  useEffect(() => {
    const syncControls = () => {
      setKeyboardControls(loadKeyboardControlsSettings());
      setControllerControls(loadControllerControlsSettings());
    };

    window.addEventListener(CONTROLS_SETTINGS_CHANGED_EVENT, syncControls);
    window.addEventListener("storage", syncControls);
    return () => {
      window.removeEventListener(CONTROLS_SETTINGS_CHANGED_EVENT, syncControls);
      window.removeEventListener("storage", syncControls);
    };
  }, []);

  useEffect(() => {
    if (!keyboardTargetMode || !state) {
      setKeyboardTarget(null);
      return;
    }

    setKeyboardTarget((current) => {
      if (current) return current;
      return myPath.length > 0
        ? myPath[myPath.length - 1]
        : state.players[currentColor].position;
    });
  }, [currentColor, keyboardTargetMode, myPath, state]);

  const closeTrainingSkillSelect = useCallback(() => {
    if (!showTrainingSkillSelect) return false;
    setShowTrainingSkillSelect(false);
    onLeaveToLobby();
    return true;
  }, [onLeaveToLobby, showTrainingSkillSelect]);

  useLobbyKeyboardNavigation({
    actionKey: keyboardControls.gameActionKey,
    controllerActionButton: controllerControls.gameActionButton,
    controllerEnabled:
      controllerControls.controllerEnabled && showTrainingSkillSelect,
    controllerSelectButton: controllerControls.selectActionButton,
    capturingControlKey: null,
    closeTopLobbyModal: closeTrainingSkillSelect,
    isControlsSettingsOpen: false,
    keyboardEnabled: keyboardControls.keyboardEnabled && showTrainingSkillSelect,
    selectKey: keyboardControls.selectActionKey,
  });

  useEffect(() => {
    const isGameOver = state?.phase === "gameover" || winner !== null;
    if (!isGameOver || showTrainingSkillSelect) return;

    const isTypingTarget = () => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return false;
      return (
        active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.tagName === "SELECT" ||
        active.isContentEditable
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget()) return;

      if (
        event.key === "Escape" ||
        event.code === keyboardControls.gameActionKey
      ) {
        event.preventDefault();
        onLeaveToLobby();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    keyboardControls.gameActionKey,
    onLeaveToLobby,
    showTrainingSkillSelect,
    state?.phase,
    winner,
  ]);

  useEffect(() => {
    const isGameOver = state?.phase === "gameover" || winner !== null;
    if (
      !isGameOver ||
      showTrainingSkillSelect ||
      !controllerControls.controllerEnabled
    ) {
      return;
    }

    let raf = 0;
    let wasPressed = false;

    const pollControllerExit = () => {
      const gamepad = navigator.getGamepads().find(Boolean);
      const isPressed =
        gamepad?.buttons[controllerControls.gameActionButton]?.pressed === true;

      if (isPressed && !wasPressed) {
        onLeaveToLobby();
        return;
      }

      wasPressed = isPressed;
      raf = window.requestAnimationFrame(pollControllerExit);
    };

    raf = window.requestAnimationFrame(pollControllerExit);
    return () => window.cancelAnimationFrame(raf);
  }, [
    controllerControls.controllerEnabled,
    controllerControls.gameActionButton,
    onLeaveToLobby,
    showTrainingSkillSelect,
    state?.phase,
    winner,
  ]);

  useEffect(() => {
    if (
      !keyboardControls.keyboardEnabled &&
      !controllerControls.controllerEnabled
    ) {
      return;
    }
    if (!state) return;
    if (showTrainingSkillSelect) return;
    if (state.phase !== "planning" || mySubmitted) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.tagName === "SELECT" ||
        target?.isContentEditable
      ) {
        return;
      }
      if (!keyboardControls.keyboardEnabled && event.isTrusted) return;

      const dirs: Record<string, Position> = {
        ArrowUp: { row: -1, col: 0 },
        ArrowDown: { row: 1, col: 0 },
        ArrowLeft: { row: 0, col: -1 },
        ArrowRight: { row: 0, col: 1 },
      };
      const dir = dirs[event.key];
      const slotEntries = [
        ["slot1", 0],
        ["slot2", 1],
        ["slot3", 2],
      ] as const;
      const matchedSlot = slotEntries.find(
        ([slot]) => keyboardControls.abilitySkillKeys[slot] === event.code,
      );

      if (event.code === keyboardControls.gameActionKey) {
        event.preventDefault();
        if (
          winner &&
          currentMatchType === "friend" &&
          !gameOverMessage &&
          !rematchRequestSent
        ) {
          getAbilitySocket().emit("request_rematch");
          setRematchRequestSent(true);
          return;
        }
        onLeaveToLobby();
        return;
      }

      if (keyboardTargetMode) {
        if (matchedSlot) {
          const skillId = getAvailableSkills()[matchedSlot[1]];
          const pendingSkillId =
            keyboardTargetMode === "teleport"
              ? "quantum_shift"
              : keyboardTargetMode === "blitz"
                ? "electric_blitz"
                : "inferno_field";

          if (skillId === pendingSkillId) {
            event.preventDefault();
            if (!isSfxMuted) playLobbyClick(sfxVolume);
            handleSkillClick(skillId);
            return;
          }
        }

        if (dir) {
          event.preventDefault();
          setKeyboardTarget((current) => {
            const origin =
              current ??
              (myPath.length > 0
                ? myPath[myPath.length - 1]
                : state.players[currentColor].position);
            const next = {
              row: origin.row + dir.row,
              col: origin.col + dir.col,
            };
            if (
              next.row < 0 ||
              next.row > 4 ||
              next.col < 0 ||
              next.col > 4
            ) {
              return origin;
            }
            return next;
          });
          return;
        }

        if (event.code === keyboardControls.selectActionKey) {
          event.preventDefault();
          if (!keyboardTarget) return;
          if (!isSfxMuted) playLobbyClick(sfxVolume);
          if (keyboardTargetMode === "teleport") {
            handleTeleportTargetSelect(keyboardTarget);
          } else if (keyboardTargetMode === "blitz") {
            handleBlitzTargetSelect(keyboardTarget);
          } else {
            handleInfernoTargetSelect(keyboardTarget);
          }
          return;
        }

        if (event.code === "Escape") {
          event.preventDefault();
          setSelectedSkillId(null);
          setPendingTeleport(false);
          setPendingBlitz(false);
          setPendingInferno(false);
        }
        return;
      }

      if (matchedSlot) {
        const skillId = getAvailableSkills()[matchedSlot[1]];
        if (!skillId) return;
        if (ABILITY_SKILLS[skillId].category === "passive") return;
        event.preventDefault();
        if (!isSfxMuted) playLobbyClick(sfxVolume);
        setMySkillInfo(null);
        handleSkillClick(skillId);
        return;
      }

      if (!dir) return;

      const me = state.players[currentColor];
      const chargeReservedNonOverdrive = skillReservations.some(
        (entry) => entry.skillId === "plasma_charge",
      );
      const bigBangReservation = skillReservations.find(
        (entry) => entry.skillId === "cosmic_bigbang",
      );
      const guardReserved = skillReservations.some(
        (entry) => entry.skillId === "classic_guard",
      );
      const effectivePathPoints = me.reboundLocked
        ? 0
        : bigBangReservation
          ? bigBangReservation.step
          : chargeReservedNonOverdrive
            ? 1
            : guardReserved
              ? 0
              : state.pathPoints;
      const canDrawPath =
        effectivePathPoints > 0 &&
        !skillReservations.some(
          (reservation) =>
            reservation.skillId === "classic_guard" ||
            reservation.skillId === "electric_blitz" ||
            reservation.skillId === "cosmic_bigbang",
        );

      if (!canDrawPath) return;

      event.preventDefault();
      const teleportStep = teleportReservation?.step ?? null;
      const teleportTarget = teleportReservation?.target ?? null;
      const start = getPreviewStart();
      const current = myPath;
      const lastPos =
        current.length === 0
          ? start
          : teleportTarget && current.length === teleportStep
            ? teleportTarget
            : current[current.length - 1];
      const next: Position = {
        row: lastPos.row + dir.row,
        col: lastPos.col + dir.col,
      };

      if (next.row < 0 || next.row > 4 || next.col < 0 || next.col > 4) return;
      if (isBlockedCell(next, state.obstacles)) return;

      if (current.length > 0) {
        const isExtendingFromTeleportTarget =
          teleportTarget &&
          teleportStep !== null &&
          current.length === teleportStep;
        const secondLast =
          current.length < 2
            ? start
            : teleportTarget && current.length - 1 === teleportStep
              ? teleportTarget
              : current[current.length - 2];
        if (!isExtendingFromTeleportTarget && posEqual(next, secondLast)) {
          if (!isSfxMuted) playPathStepClick(sfxVolume);
          updateMyPath(current.slice(0, -1));
          return;
        }
      }

      if (current.length >= effectivePathPoints) return;
      if (isValidMove(lastPos, next)) {
        if (!isSfxMuted) playPathStepClick(sfxVolume);
        updateMyPath([...current, next]);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    currentColor,
    currentMatchType,
    gameOverMessage,
    controllerControls.controllerEnabled,
    isSfxMuted,
    keyboardControls,
    keyboardTarget,
    keyboardTargetMode,
    myPath,
    mySubmitted,
    onLeaveToLobby,
    rematchRequestSent,
    setRematchRequestSent,
    showTrainingSkillSelect,
    sfxVolume,
    skillReservations,
    state,
    teleportReservation,
    winner,
  ]);

  useEffect(() => {
    if (!controllerControls.controllerEnabled || !state) return;
    if (showTrainingSkillSelect) return;
    if (state.phase !== "planning" || mySubmitted) return;

    let raf = 0;
    let lastInput = "";
    let lastInputAt = 0;

    const getDirection = (gamepad: Gamepad) => {
      if (gamepad.buttons[12]?.pressed) return "ArrowUp";
      if (gamepad.buttons[13]?.pressed) return "ArrowDown";
      if (gamepad.buttons[14]?.pressed) return "ArrowLeft";
      if (gamepad.buttons[15]?.pressed) return "ArrowRight";

      const horizontal = gamepad.axes[0] ?? 0;
      const vertical = gamepad.axes[1] ?? 0;
      if (Math.abs(horizontal) > Math.abs(vertical)) {
        if (horizontal <= -0.55) return "ArrowLeft";
        if (horizontal >= 0.55) return "ArrowRight";
      }
      if (vertical <= -0.55) return "ArrowUp";
      if (vertical >= 0.55) return "ArrowDown";
      return "";
    };

    const emitKey = (key: string, code = key) => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key, code }));
    };

    const pollController = () => {
      const gamepad = navigator.getGamepads().find(Boolean);
      if (gamepad) {
        const direction = getDirection(gamepad);
        const slotEntries = [
          ["slot1", 0],
          ["slot2", 1],
          ["slot3", 2],
        ] as const;
        const matchedSlot = slotEntries.find(([slot]) => {
          const buttonIndex = controllerControls.abilitySkillButtons[slot];
          return gamepad.buttons[buttonIndex]?.pressed;
        });
        const buttonCode =
          matchedSlot !== undefined
            ? `slot:${matchedSlot[0]}`
            : gamepad.buttons[controllerControls.gameActionButton]?.pressed
              ? "gameAction"
              : gamepad.buttons[controllerControls.selectActionButton]?.pressed
                ? "selectAction"
                : "";
        const input = direction || buttonCode;
        const now = performance.now();

        if (!input) {
          lastInput = "";
        } else {
          const delay =
            input === lastInput
              ? input.startsWith("Arrow")
                ? 160
                : Number.POSITIVE_INFINITY
              : 0;
          if (input !== lastInput || now - lastInputAt >= delay) {
            lastInput = input;
            lastInputAt = now;

            if (direction) {
              emitKey(direction);
            } else if (matchedSlot) {
              emitKey("", keyboardControls.abilitySkillKeys[matchedSlot[0]]);
            } else if (buttonCode === "gameAction") {
              emitKey("", keyboardControls.gameActionKey);
            } else if (buttonCode === "selectAction") {
              emitKey("", keyboardControls.selectActionKey);
            }
          }
        }
      }

      raf = window.requestAnimationFrame(pollController);
    };

    raf = window.requestAnimationFrame(pollController);
    return () => window.cancelAnimationFrame(raf);
  }, [
    controllerControls,
    keyboardControls,
    mySubmitted,
    showTrainingSkillSelect,
    state,
  ]);

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

      if (
        event.skillId === "sun_chariot" &&
        (!event.damages || event.damages.length === 0)
      ) {
        if (!isSfxMuted) {
          playSunChariot(sfxVolume);
        }
        setAbilityBanner(null);
        done();
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

      if (event.skillId === "wizard_magic_mine") {
        if (event.damages && event.damages.length > 0) {
          // 설치자: trapTiles에서 즉시 제거
          // 피격자: briefMineRevealPositions에 잠깐 추가 (SKILL_PAUSE_MS 후 제거)
          const triggeredPositions = event.affectedPositions ?? [];
          setTrapTiles((prev) =>
            prev.filter(
              (trap) =>
                !triggeredPositions.some(
                  (pos) =>
                    trap.position.row === pos.row &&
                    trap.position.col === pos.col,
                ),
            ),
          );
          if (event.color !== currentColor) {
            const revealIds: number[] = [];
            for (const position of triggeredPositions) {
              const id = Date.now() + Math.random();
              revealIds.push(id);
              setBriefMineRevealPositions((prev) => [
                ...prev,
                { id, position },
              ]);
            }
            queueAnimationTimeout(() => {
              setBriefMineRevealPositions((prev) =>
                prev.filter((e) => !revealIds.includes(e.id)),
              );
            }, SKILL_PAUSE_MS);
          }
          for (const damage of event.damages) {
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
        // Trap placed — show magic circle for the rest of this turn (cleared on next round start)
        setMagicMineCastingColors((prev) => ({ ...prev, [event.color]: true }));
        if (!isSfxMuted) playMagicMine(sfxVolume);
        queueAnimationTimeout(() => {
          setAbilityBanner(null);
          done();
        }, SKILL_PAUSE_MS);
        return;
      }

      if (
        event.skillId === "chronos_time_rewind" &&
        event.to &&
        typeof event.rewindHp === "number"
      ) {
        const rewindTarget = event.to;
        const rewindHp = event.rewindHp;
        const currentHp = stateRef.current?.players[event.color].hp ?? 0;
        const trail = [
          ...(event.from ? [event.from] : []),
          ...(event.affectedPositions ?? []),
          rewindTarget,
        ].filter((position, index, array) => {
          if (index === 0) return true;
          const prev = array[index - 1];
          return !(prev.row === position.row && prev.col === position.col);
        });
        const movementTrail = trail.slice(1);
        setTimeRewindFocusColor(event.color);
        setRewindingPieceColor(event.color);
        if (!isSfxMuted) {
          playChronosTickTock(sfxVolume);
        }

        queueAnimationTimeout(() => {
          const totalTicks = Math.max(
            movementTrail.length,
            Math.max(0, rewindHp - currentHp),
          );

          if (!isSfxMuted && totalTicks > 0) {
            startChronosRewindLoop(sfxVolume);
          }

          if (totalTicks === 0) {
            setState((prev) => {
              if (!prev) return prev;
              return {
                ...prev,
                players: {
                  ...prev.players,
                  [event.color]: {
                    ...prev.players[event.color],
                    position: rewindTarget,
                    hp: rewindHp,
                  },
                },
              };
            });
            if (event.color === "red") {
              setRedDisplayPos(rewindTarget);
            } else {
              setBlueDisplayPos(rewindTarget);
            }
            queueAnimationTimeout(() => {
              stopChronosRewindLoop();
              setRewindingPieceColor(null);
              setTimeRewindFocusColor(null);
              setAbilityBanner(null);
              done();
            }, TIME_REWIND_HP_STEP_MS);
            return;
          }

          for (let index = 0; index < totalTicks; index += 1) {
            queueAnimationTimeout(
              () => {
                const nextPos =
                  movementTrail[index] ??
                  movementTrail[movementTrail.length - 1] ??
                  rewindTarget;

                setState((prev) => {
                  if (!prev) return prev;
                  const nextHp = Math.min(
                    rewindHp,
                    prev.players[event.color].hp +
                      (index < rewindHp - currentHp ? 1 : 0),
                  );
                  return {
                    ...prev,
                    players: {
                      ...prev.players,
                      [event.color]: {
                        ...prev.players[event.color],
                        position: nextPos,
                        hp: nextHp,
                      },
                    },
                  };
                });

                if (event.color === "red") {
                  setRedDisplayPos(nextPos);
                } else {
                  setBlueDisplayPos(nextPos);
                }
              },
              (index + 1) * TIME_REWIND_HP_STEP_MS,
            );
          }

          queueAnimationTimeout(
            () => {
              stopChronosRewindLoop();
              setState((prev) => {
                if (!prev) return prev;
                return {
                  ...prev,
                  players: {
                    ...prev.players,
                    [event.color]: {
                      ...prev.players[event.color],
                      position: rewindTarget,
                      hp: rewindHp,
                    },
                  },
                };
              });
              if (event.color === "red") {
                setRedDisplayPos(rewindTarget);
              } else {
                setBlueDisplayPos(rewindTarget);
              }
              setRewindingPieceColor(null);
              setTimeRewindFocusColor(null);
              setAbilityBanner(null);
              done();
            },
            totalTicks * TIME_REWIND_HP_STEP_MS + 40,
          );
        }, TIME_REWIND_FREEZE_MS);
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
    const sunChariotSteps: NullableNumberByColor = {
      red:
        payload.skillEvents.find(
          (event) => event.skillId === "sun_chariot" && event.color === "red",
        )?.step ?? null,
      blue:
        payload.skillEvents.find(
          (event) => event.skillId === "sun_chariot" && event.color === "blue",
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
        setActiveSunChariots(createFalseFlags());
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
      setActiveSunChariots({
        red: sunChariotSteps.red !== null && step >= sunChariotSteps.red,
        blue: sunChariotSteps.blue !== null && step >= sunChariotSteps.blue,
      });

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
        runStepEventsAndCollisions(step, () => {
          const finalizeDefenseEnd = () => {
            const { endedGuards, endedAtFields } = consumeDefenseVisualStep();

            const continueStep = () => {
              advance(step + 1);
            };

            runGuardEndNotice(endedGuards, () =>
              runAtFieldEndNotice(endedAtFields, continueStep),
            );
          };

          finalizeDefenseEnd();
        });
      }, STEP_DURATION_MS);
    };

    if (initialRevealPauseMs > 0) {
      queueAnimationTimeout(() => advance(0), initialRevealPauseMs);
      return;
    }
    advance(0);
  };

  useEffect(() => {
    const socket = isLocalAbilityTraining
      ? getLocalAbilityTrainingSocket()
      : getSocket();

    const onGameStart = (nextState: AbilityBattleState) => {
      setRoundInfo(null);
      setTrapTiles([]);
      setPendingOwnedTriggeredTrapTiles([]);
      resetPlanningState();
      applyState(nextState);
    };

    const onRoundStart = (payload: AbilityRoundStartPayload) => {
      if (!isLocalAbilityTraining) {
        void syncServerTime(getSocket());
      }
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
      setTrapTiles(nextState.trapTiles ?? []);
      setPendingOwnedTriggeredTrapTiles([]);
      setMagicMineCastingColors({ red: false, blue: false });
      setBriefMineRevealPositions([]);
      resetPlanningState();
      applyState(nextState);
    };

    const onRoomJoined = ({
      roomId,
      color,
      training,
    }: {
      roomId: string;
      color: PlayerColor;
      training?: boolean;
    }) => {
      setMyColor(color);
      setRoomCode(roomId);
      if (!training) {
        socket.emit("ability_client_ready");
      }
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

    const onResolution = (
      payload: AbilityResolutionPayload & { trapTiles?: AbilityTrapTile[] },
    ) => {
      setRoundInfo(null);
      setTrapTiles(payload.trapTiles ?? []);
      const triggeredOwnedMinePositions = payload.skillEvents
        .filter(
          (event) =>
            event.skillId === "wizard_magic_mine" &&
            !!event.damages?.length &&
            event.color === currentColor,
        )
        .flatMap((event) => event.affectedPositions ?? []);
      setPendingOwnedTriggeredTrapTiles(
        triggeredOwnedMinePositions.map((position) => ({
          position,
          owner: currentColor,
          remainingTurns: 1,
        })),
      );
      const hadSunChariotReserved = skillReservationsRef.current.some(
        (entry) => entry.skillId === "sun_chariot",
      );
      if (hadSunChariotReserved) {
        setTransitionSunChariots({
          red: currentColor === "red",
          blue: currentColor === "blue",
        });
      }
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
      if (
        winnerRef.current !== null ||
        stateRef.current?.phase === "gameover"
      ) {
        return;
      }
      const disconnectedColor = currentColor === "red" ? "blue" : "red";
      setRoundInfo((prev) =>
        prev
          ? {
              ...prev,
              state: {
                ...prev.state,
                pathPoints: 30,
              },
            }
          : prev,
      );
      setState((prev) => {
        if (!prev) return prev;
        const nextState = {
          ...prev,
          pathPoints: 30,
          players: {
            ...prev.players,
            [disconnectedColor]: {
              ...prev.players[disconnectedColor],
              connected: false,
            },
          },
        };
        stateRef.current = nextState;
        return nextState;
      });
      setGameOverMessage(
        lang === "en"
          ? "The opponent disconnected."
          : "상대가 연결을 끊었습니다.",
      );
    };

    const onRematchRequested = () => {
      setRematchRequested(true);
    };

    const onTrainingSkillSelect = () => {
      setTrainingLoadout([]);
      setTrainingFloatingMessage(null);
      setShowTrainingSkillSelect(true);
    };

    socket.on("ability_game_start", onGameStart);
    socket.on("ability_round_start", onRoundStart);
    socket.on("ability_room_joined", onRoomJoined);
    socket.on("ability_training_skill_select", onTrainingSkillSelect);
    socket.on("ability_plan_updated", onPlanUpdated);
    socket.on("ability_opponent_submitted", onOpponentSubmitted);
    socket.on("ability_player_submitted", onPlayerSubmitted);
    socket.on("ability_resolution", onResolution);
    socket.on("ability_game_over", onGameOver);
    socket.on("opponent_disconnected", onOpponentDisconnected);
    socket.on("rematch_requested", onRematchRequested);

    if (isLocalAbilityTraining) {
      connectLocalAbilityTrainingClient();
    } else if (!initialReadySentRef.current) {
      initialReadySentRef.current = true;
      socket.emit("ability_client_ready");
    }

    return () => {
      clearAnimationTimeouts();
      clearSubmitTimeouts();
      socket.off("ability_game_start", onGameStart);
      socket.off("ability_round_start", onRoundStart);
      socket.off("ability_room_joined", onRoomJoined);
      socket.off("ability_training_skill_select", onTrainingSkillSelect);
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
    isLocalAbilityTraining,
    isSfxMuted,
    lang,
    setMyColor,
    setRematchRequestSent,
    setRoomCode,
    sfxVolume,
  ]);

  useEffect(() => {
    if (isLocalAbilityTraining) {
      setConnStatus("connected");
      return;
    }
    const socket = getSocket();

    const handleDisconnect = () => {
      setConnStatus("reconnecting");
    };

    const handleConnect = () => {
      const { authAccessToken, myNickname } = useGameStore.getState();
      socket.emit("rejoin_game", { accessToken: authAccessToken, nickname: myNickname });
    };

    const handleRejoinAck = (payload: {
      mode: string;
      color: PlayerColor;
      roomCode: string;
      abilityState?: AbilityBattleState;
    }) => {
      if (payload.mode !== "ability") return;
      const store = useGameStore.getState();
      store.setMyColor(payload.color);
      store.setRoomCode(payload.roomCode);
      if (payload.abilityState) applyStateRef.current(payload.abilityState);
      setConnStatus("connected");
      socket.emit("ability_client_ready");
    };

    const handleRejoinNotFound = () => {
      setConnStatus("failed");
      setTimeout(onLeaveToLobby, 1500);
    };

    socket.on("disconnect", handleDisconnect);
    socket.on("connect", handleConnect);
    socket.on("rejoin_ack", handleRejoinAck);
    socket.on("rejoin_not_found", handleRejoinNotFound);

    return () => {
      socket.off("disconnect", handleDisconnect);
      socket.off("connect", handleConnect);
      socket.off("rejoin_ack", handleRejoinAck);
      socket.off("rejoin_not_found", handleRejoinNotFound);
    };
  }, [isLocalAbilityTraining, onLeaveToLobby]);

  useEffect(() => {
    if (!state || state.phase !== "planning" || mySubmitted || !roundInfo)
      return;
    const socket = isLocalAbilityTraining
      ? getLocalAbilityTrainingSocket()
      : getSocket();
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
  }, [currentColor, isLocalAbilityTraining, myPath, mySubmitted, roundInfo, skillReservations, state]);

  const trainingSkillSelectOverlay =
    showTrainingSkillSelect &&
    ReactDOM.createPortal(
      <div
        className="upgrade-modal-backdrop"
        style={{ zIndex: 200 }}
        onClickCapture={handleTrainingSkillSelectClickCapture}
      >
        <div
          className="upgrade-modal skin-modal ability-loadout-modal"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="skin-modal-head">
            <h3>{lang === "en" ? "Equipped Skills" : "장착 스킬"}</h3>
            <div
              className="skin-token-badge"
              aria-label="Ability loadout count"
            >
              <span className="skin-token-badge-main">
                <span>{trainingLoadout.length} / 3</span>
                <span>{lang === "en" ? "equipped" : "장착 중"}</span>
              </span>
            </div>
          </div>
          <p>
            {lang === "en"
              ? "Select up to 3 skills. All skills are available in training."
              : "훈련장에서는 모든 스킬을 사용할 수 있습니다. 최대 3개를 선택하세요."}
          </p>
          <div className="ability-loadout-chip-row ability-loadout-modal-selected">
            {trainingLoadout.map((skillId) => {
              const skill = ABILITY_SKILLS[skillId];
              if (!skill) return null;
              return (
                <span key={skillId} className="ability-loadout-chip">
                  {renderSkillIcon(skillId)}
                  <span>{lang === "en" ? skill.name.en : skill.name.kr}</span>
                </span>
              );
            })}
          </div>
          {trainingFloatingMessage && (
            <div
              key={trainingFloatingMessage.id}
              className="skin-floating-message"
              role="status"
              aria-live="polite"
              onAnimationEnd={() => setTrainingFloatingMessage(null)}
            >
              {trainingFloatingMessage.text}
            </div>
          )}
          <div className="skin-option-list">
            {TRAINING_ABILITY_SKILLS.map((skill, index) => {
              const equipped = trainingLoadout.includes(skill.id);
              const skillSummary =
                lang === "en"
                  ? {
                      tags: skill.loadoutTags.en,
                      desc: skill.loadoutDescription.en,
                    }
                  : {
                      tags: skill.loadoutTags.kr,
                      desc: skill.loadoutDescription.kr,
                    };
              return (
                <button
                  key={skill.id}
                  className={`skin-option-card ${equipped ? "is-selected" : ""}`}
                  data-keyboard-modal-layer={`training-skill-row-${index}`}
                  type="button"
                  onClick={() => {
                    if (equipped) {
                      setTrainingLoadout(
                        trainingLoadout.filter((id) => id !== skill.id),
                      );
                      return;
                    }
                    if (trainingLoadout.length >= 3) {
                      trainingFloatingMessageIdRef.current += 1;
                      setTrainingFloatingMessage({
                        id: trainingFloatingMessageIdRef.current,
                        text:
                          lang === "en"
                            ? "You can equip up to 3 skills."
                            : "스킬은 최대 3개까지 장착할 수 있습니다.",
                      });
                      return;
                    }
                    setTrainingLoadout([...trainingLoadout, skill.id]);
                  }}
                >
                  <span className="skin-preview ability-skill-preview">
                    {renderSkillIcon(skill.id)}
                  </span>
                  <span className="skin-option-copy">
                    <strong>
                      {lang === "en" ? skill.name.en : skill.name.kr}
                    </strong>
                    <span>
                      {skillSummary.tags}
                      <br />
                      {skillSummary.desc}
                    </span>
                  </span>
                  <span className="skin-lock-meta ability-skill-meta">
                    <span className="skin-lock-icon" aria-hidden="true">
                      ✨
                    </span>
                    <span>
                      {skill.category === "passive"
                        ? lang === "en"
                          ? "Passive · Auto"
                          : "패시브 · 자동"
                        : lang === "en"
                          ? `${skill.manaCost} mana · ${skill.category}`
                          : `마나 ${skill.manaCost} · ${skill.category === "attack" ? "공격" : skill.category === "defense" ? "방어" : "유틸"}`}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
          <div className="upgrade-modal-actions">
            <button
              className="lobby-btn primary"
              data-keyboard-modal-layer="training-actions"
              type="button"
              onClick={() => {
                const socket = getAbilitySocket();
                socket.emit("training_skills_confirmed", {
                  skills: trainingLoadout,
                });
                setShowTrainingSkillSelect(false);
              }}
            >
              {lang === "en" ? "Confirm" : "확인"}
            </button>
            <button
              className="lobby-btn"
              data-keyboard-modal-layer="training-actions"
              type="button"
              onClick={() => {
                setShowTrainingSkillSelect(false);
                onLeaveToLobby();
              }}
            >
              {lang === "en" ? "Back to Lobby" : "로비로 돌아가기"}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );

  if (!state) {
    return (
      <>
        <div className="gs-loading">
          {lang === "en" ? "Loading ability battle..." : "능력 대전 로딩 중..."}
        </div>
        {trainingSkillSelectOverlay}
      </>
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
  const overdriveTurn = false;
  const chargeReservedNonOverdrive =
    !overdriveTurn &&
    skillReservations.some((e) => e.skillId === "plasma_charge");
  const bigBangReservation = !overdriveTurn
    ? skillReservations.find((e) => e.skillId === "cosmic_bigbang")
    : undefined;
  const guardReserved =
    !overdriveTurn &&
    skillReservations.some((e) => e.skillId === "classic_guard");
  const effectivePathPoints = me.reboundLocked
    ? 0
    : bigBangReservation
      ? bigBangReservation.step
      : chargeReservedNonOverdrive
        ? 1
        : guardReserved
          ? 0
          : state.pathPoints;
  const isTrainingMatch = opponent.nickname === "Training Dummy";
  const rewardTokens =
    winner &&
    winner === currentColor &&
    currentMatchType === "ability" &&
    !isTrainingMatch
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
          reservation.skillId === "electric_blitz" ||
          reservation.skillId === "cosmic_bigbang",
      ));

  const handleRematch = () => {
    onLeaveToLobby();
  };

  const handleRequestRematch = () => {
    getAbilitySocket().emit("request_rematch");
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
    <div className={`game-screen ability-screen ${screenBoardClass}`}>
      {connStatus !== "connected" && (
        <div className="gs-reconnecting-overlay">
          <span className="gs-reconnecting-spinner" />
          <span>
            {connStatus === "reconnecting" ? (lang === "en" ? "Reconnecting…" : "재연결 중…") : (lang === "en" ? "Connection failed" : "연결 실패")}
          </span>
        </div>
      )}
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

      {trainingSkillSelectOverlay}

      <div className="gs-board-stage">
        {winner && (
          <div className="gs-result-slot">
            <div className="gameover-overlay">
              <div className="gameover-box">
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
                {!gameOverMessage && currentMatchType === "friend" && (
                  <button
                    className="rematch-btn rematch-btn-blue"
                    onClick={handleRequestRematch}
                  >
                    {lang === "en" ? "REMATCH" : "재시합"}
                  </button>
                )}
                {!gameOverMessage && (
                  <button
                    className="rematch-btn ability-gameover-lobby-btn"
                    onClick={handleRematch}
                  >
                    {lang === "en" ? "LOBBY" : "로비"}
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
              <span className="gs-path-label path-points-label-highlight">
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
              const isOpponentTimeRewindSpent =
                skillId === "chronos_time_rewind" && opponent.timeRewindUsed;
              return (
                <div key={skillId} className="ability-opponent-panel-skill">
                  <span className="ability-opponent-panel-skill-icon">
                    {renderSkillIcon(skillId)}
                  </span>
                  <span
                    className={`ability-opponent-panel-skill-name ${isOpponentTimeRewindSpent ? "used" : ""}`}
                  >
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
            trapTiles={visibleTrapTiles}
            magicMineCastingColors={magicMineCastingColors}
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
            activeSunChariots={visibleSunChariots}
            movingAtomicClones={movingAtomicClones}
            movingPaths={movingPaths}
            movingStarts={movingStarts}
            timeRewindFocusColor={timeRewindFocusColor}
            timeRewindActive={timeRewindFocusColor !== null}
            rewindingPieceColor={rewindingPieceColor}
            cellSize={cellSize}
            isPlanning={state.phase === "planning"}
            canEditPath={canDrawPath}
            teleportTargetsVisible={pendingTeleport}
            blitzTargetsVisible={pendingBlitz}
            infernoTargetsVisible={
              pendingInferno && selectedSkillId === "inferno_field"
            }
            keyboardTarget={keyboardTarget}
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
                      ? `tile ${reservation.step}`
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
                ? ABILITY_SKILLS[mySkillInfo].loadoutDescription.en
                : ABILITY_SKILLS[mySkillInfo].loadoutDescription.kr}
            </span>
          </div>
        )}
        <div className="ability-skill-buttons">
          {getAvailableSkills().map((skillId) => {
            const skill = ABILITY_SKILLS[skillId];
            const reserved = skillReservations.some(
              (entry) => entry.skillId === skillId,
            );
            const isTimeRewindSpent =
              skillId === "chronos_time_rewind" && me.timeRewindUsed;
            const passiveSkill = skill.category === "passive";
            const roleBlocked =
              ((skillId === "classic_guard" ||
                skillId === "gold_overdrive" ||
                skillId === "phase_shift" ||
                skillId === "arc_reactor_field") &&
                getMyRole() !== "escaper") ||
              ((skillId === "ember_blast" ||
                skillId === "sun_chariot" ||
                skillId === "atomic_fission" ||
                skillId === "inferno_field" ||
                skillId === "nova_blast" ||
                skillId === "wizard_magic_mine" ||
                skillId === "electric_blitz" ||
                skillId === "cosmic_bigbang") &&
                getMyRole() !== "attacker");
            const atomicUnavailable =
              skillId === "atomic_fission" &&
              (!me.previousTurnStart || me.previousTurnPath.length === 0);
            const bigBangBlocked =
              skillId === "cosmic_bigbang" &&
              !reserved &&
              !overdriveTurn &&
              myPath.length >= 4;
            const disabled =
              !isPlanning ||
              mySubmitted ||
              passiveSkill ||
              roleBlocked ||
              atomicUnavailable ||
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
                <span
                  className={`ability-skill-name ${isTimeRewindSpent ? "used" : ""}`}
                >
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
