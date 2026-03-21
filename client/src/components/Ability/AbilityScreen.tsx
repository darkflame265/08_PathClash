import { useEffect, useRef, useState, type CSSProperties } from "react";
import { getSocket } from "../../socket/socketClient";
import { syncServerTime, getEstimatedServerNow } from "../../socket/timeSync";
import { useLang } from "../../hooks/useLang";
import { useGameStore } from "../../store/gameStore";
import { TimerBar } from "../Game/TimerBar";
import { PlayerInfo } from "../Game/PlayerInfo";
import { HpDisplay } from "../Game/HpDisplay";
import { playHit } from "../../utils/soundUtils";
import type { PlayerColor, Position } from "../../types/game.types";
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
const SKILL_PAUSE_MS = 320;

function computeInitialCellSize(): number {
  const availW = Math.max(260, window.innerWidth - 24);
  return Math.max(MIN_CELL, Math.min(MAX_CELL, availW / 5));
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
  const [pendingExplosionStep, setPendingExplosionStep] = useState(false);
  const [pendingTeleport, setPendingTeleport] = useState(false);
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
  const [activeGuards, setActiveGuards] = useState<{
    red: boolean;
    blue: boolean;
  }>({ red: false, blue: false });
  const [movingPaths, setMovingPaths] = useState<{
    red: Position[];
    blue: Position[];
  }>({ red: [], blue: [] });
  const [winner, setWinner] = useState<PlayerColor | "draw" | null>(null);
  const [gameOverMessage, setGameOverMessage] = useState<string | null>(null);
  const [rematchRequested, setRematchRequested] = useState(false);
  const [abilityBanner, setAbilityBanner] = useState<string | null>(null);
  const [opponentSkillInfo, setOpponentSkillInfo] =
    useState<AbilitySkillId | null>(null);

  const stateRef = useRef<AbilityBattleState | null>(null);
  const animationTimeoutIdsRef = useRef<number[]>([]);
  const submitTimeoutIdsRef = useRef<number[]>([]);
  const gridAreaRef = useRef<HTMLDivElement>(null);
  const cellSize = useAdaptiveCellSize(gridAreaRef);
  const scale = cellSize / DEFAULT_CELL;
  const currentColor = myColor ?? "red";
  const opponentColor: PlayerColor = currentColor === "red" ? "blue" : "red";
  const previousGuardPathRef = useRef<Position[]>([]);
  const previousTeleportPathRef = useRef<Position[]>([]);
  const reservationOrderRef = useRef(1);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
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

  const resetPlanningState = () => {
    setMyPath([]);
    setSkillReservations([]);
    setSelectedSkillId(null);
    setPendingExplosionStep(false);
    setPendingTeleport(false);
    setMySubmitted(false);
    setOpponentSubmitted(false);
    previousGuardPathRef.current = [];
    previousTeleportPathRef.current = [];
    reservationOrderRef.current = 1;
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
    setHitFlags({ red: false, blue: false });
    setExplodingFlags({ red: false, blue: false });
    setCollisionEffects([]);
    setMovingPaths({ red: [], blue: [] });
    if (nextState.phase !== "gameover") {
      setWinner(null);
      setGameOverMessage(null);
      setRematchRequested(false);
      setRematchRequestSent(false);
    }
  };

  const getMyRole = () => state?.players[currentColor].role ?? "escaper";
  const getMyMana = () => state?.players[currentColor].mana ?? 0;
  const getPreviewStart = () => {
    const teleport = skillReservations.find(
      (entry) => entry.skillId === "quantum_shift" && entry.target,
    );
    return (
      teleport?.target ??
      state?.players[currentColor].position ?? { row: 2, col: 0 }
    );
  };

  const getAvailableSkills = () =>
    state?.players[currentColor].equippedSkills ?? [];
  const getSkillCost = (skillId: AbilitySkillId) =>
    ABILITY_SKILLS[skillId].manaCost;
  const getReservedMana = () =>
    skillReservations.reduce(
      (sum, reservation) => sum + getSkillCost(reservation.skillId),
      0,
    );
  const getRemainingMana = () => Math.max(0, getMyMana() - getReservedMana());

  const syncMyPlan = (
    path: Position[],
    reservations: AbilitySkillReservation[],
  ) => {
    const socket = getSocket();
    socket.emit("ability_plan_update", { path, skills: reservations });
  };

  const updateMyPath = (nextPath: Position[]) => {
    setMyPath(nextPath);
    syncMyPlan(nextPath, skillReservations);
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
    setSelectedSkillId(null);
    setPendingExplosionStep(false);
    setPendingTeleport(false);

    if (skillId === "classic_guard") {
      setMyPath(previousGuardPathRef.current);
      setSkillReservations(nextReservations);
      syncMyPlan(previousGuardPathRef.current, nextReservations);
      return;
    }

    if (skillId === "quantum_shift") {
      setMyPath(previousTeleportPathRef.current);
      setSkillReservations(nextReservations);
      syncMyPlan(previousTeleportPathRef.current, nextReservations);
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

  const beginExplosionStepPick = () => {
    if (getMyRole() !== "attacker") return;
    if (getRemainingMana() < getSkillCost("ember_blast")) return;
    setSelectedSkillId("ember_blast");
    setPendingExplosionStep(true);
    setPendingTeleport(false);
  };

  const beginTeleportPick = () => {
    const alreadyReserved = skillReservations.some(
      (entry) => entry.skillId === "quantum_shift",
    );
    if (alreadyReserved) {
      removeReservation("quantum_shift");
      return;
    }
    if (getRemainingMana() < getSkillCost("quantum_shift")) return;
    previousTeleportPathRef.current = myPath;
    setSelectedSkillId("quantum_shift");
    setPendingTeleport(true);
    setPendingExplosionStep(false);
  };

  const handleExplosionStepSelect = (step: number) => {
    const nextReservations: AbilitySkillReservation[] = [
      ...skillReservations.filter((entry) => entry.skillId !== "ember_blast"),
      { skillId: "ember_blast", step, order: reservationOrderRef.current++ },
    ];
    updateSkillReservations(nextReservations);
    setPendingExplosionStep(false);
    setSelectedSkillId(null);
  };

  const handleTeleportTargetSelect = (target: Position) => {
    const nextReservations: AbilitySkillReservation[] = [
      ...skillReservations.filter((entry) => entry.skillId !== "quantum_shift"),
      {
        skillId: "quantum_shift",
        step: 0,
        order: reservationOrderRef.current++,
        target,
      },
    ];
    setMyPath([]);
    setSkillReservations(nextReservations);
    setSelectedSkillId(null);
    setPendingTeleport(false);
    syncMyPlan([], nextReservations);
  };

  const handleSkillClick = (skillId: AbilitySkillId) => {
    if (state?.phase !== "planning" || mySubmitted) return;
    if (skillId === "classic_guard") {
      toggleGuardSkill();
      return;
    }
    if (skillId === "ember_blast") {
      beginExplosionStepPick();
      return;
    }
    if (skillId === "quantum_shift") {
      beginTeleportPick();
    }
  };

  const triggerLocalHit = (
    color: PlayerColor,
    hpAfter: number,
    position: Position,
  ) => {
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
  };

  const runSkillEvent = (
    event: AbilityResolutionPayload["skillEvents"][number],
    done: () => void,
  ) => {
    const skill = ABILITY_SKILLS[event.skillId];
    setAbilityBanner(
      `${event.color === currentColor ? (lang === "en" ? "You" : "내 말") : lang === "en" ? "Enemy" : "상대"} · ${lang === "en" ? skill.name.en : skill.name.kr}`,
    );

    if (event.skillId === "classic_guard") {
      setActiveGuards((prev) => ({ ...prev, [event.color]: true }));
    }

    if (event.skillId === "quantum_shift" && event.to) {
      if (event.color === "red") setRedDisplayPos(event.to);
      else setBlueDisplayPos(event.to);
    }

    for (const damage of event.damages ?? []) {
      setState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: {
            ...prev.players,
            [damage.color]: { ...prev.players[damage.color], hp: damage.newHp },
          },
        };
      });
      triggerLocalHit(damage.color, damage.newHp, damage.position);
    }

    queueAnimationTimeout(() => {
      setAbilityBanner(null);
      done();
    }, SKILL_PAUSE_MS);
  };

  const runAnimation = (payload: AbilityResolutionPayload) => {
    clearAnimationTimeouts();
    setMovingPaths({ red: payload.redPath, blue: payload.bluePath });

    const skillMap = new Map<number, AbilityResolutionPayload["skillEvents"]>();
    for (const event of payload.skillEvents) {
      const list = skillMap.get(event.step) ?? [];
      list.push(event);
      skillMap.set(
        event.step,
        list.sort((left, right) => left.order - right.order),
      );
    }

    const collisionMap = new Map<
      number,
      AbilityResolutionPayload["collisions"][number]
    >();
    for (const collision of payload.collisions) {
      collisionMap.set(collision.step, collision);
    }

    const redSeq = [payload.redStart, ...payload.redPath];
    const blueSeq = [payload.blueStart, ...payload.bluePath];
    const maxSteps = Math.max(redSeq.length - 1, blueSeq.length - 1);

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

    const advance = (step: number) => {
      if (step === 0) {
        const events = skillMap.get(0) ?? [];
        if (events.length > 0) {
          runSkillQueue(events, 0, () => advance(1));
          return;
        }
        advance(1);
        return;
      }

      if (step > maxSteps) {
        setMovingPaths({ red: [], blue: [] });
        return;
      }

      setRedDisplayPos(redSeq[Math.min(step, redSeq.length - 1)]);
      setBlueDisplayPos(blueSeq[Math.min(step, blueSeq.length - 1)]);

      queueAnimationTimeout(() => {
        const collision = collisionMap.get(step);
        if (collision) {
          setState((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              players: {
                ...prev.players,
                [collision.escapeeColor]: {
                  ...prev.players[collision.escapeeColor],
                  hp: collision.newHp,
                },
              },
            };
          });
          triggerLocalHit(
            collision.escapeeColor,
            collision.newHp,
            collision.position,
          );
        }

        const events = skillMap.get(step) ?? [];
        if (events.length > 0) {
          runSkillQueue(events, 0, () => advance(step + 1));
          return;
        }

        advance(step + 1);
      }, STEP_DURATION_MS);
    };

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
      setRoundInfo(payload);
      resetPlanningState();
      applyState(payload.state);
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
      setState((prev) => (prev ? { ...prev, phase: "moving" } : prev));
      runAnimation(payload);
    };

    const onGameOver = ({
      winner: nextWinner,
    }: {
      winner: PlayerColor | "draw";
    }) => {
      setWinner(nextWinner);
      setState((prev) => (prev ? { ...prev, phase: "gameover" } : prev));
      setMovingPaths({ red: [], blue: [] });
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
  }, [currentColor, lang, setMyColor, setRematchRequestSent, setRoomCode]);

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
  const rewardTokens =
    winner && winner === currentColor
      ? Math.min(6, Math.max(0, 120 - accountDailyRewardTokens))
      : 0;
  const isPlanning = state.phase === "planning";
  const previewStart = getPreviewStart();
  const canDrawPath =
    isPlanning &&
    !mySubmitted &&
    !skillReservations.some(
      (reservation) => reservation.skillId === "classic_guard",
    );

  const handleRematch = () => {
    getSocket().emit("request_rematch");
    setRematchRequestSent(true);
  };

  return (
    <div
      className="game-screen ability-screen"
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

      <div className={`gs-player-card gs-opponent gs-color-${opponentColor}`}>
        <div className="gs-role-badge ability-role-badge">
          <span className="gs-role-icon">
            {opponent.role === "attacker" ? "ATK" : "RUN"}
          </span>
          <span className="gs-role-label">
            {opponent.role === "attacker"
              ? lang === "en"
                ? "Attack"
                : "공격"
              : lang === "en"
                ? "Escape"
                : "도망"}
          </span>
        </div>
        <div className="gs-player-mid">
          <PlayerInfo player={opponent} isMe={false} />
          <span className="gs-color-tag">
            {opponentColor === "red" ? "RED" : "BLUE"}
          </span>
        </div>
        <div className="gs-hp-slot">
          <div className="ability-opponent-skills">
            {opponent.equippedSkills.map((skillId) => (
              <button
                key={skillId}
                type="button"
                className="ability-opponent-skill"
                onClick={() =>
                  setOpponentSkillInfo((current) =>
                    current === skillId ? null : skillId,
                  )
                }
              >
                {ABILITY_SKILLS[skillId].icon}
              </button>
            ))}
          </div>
          <HpDisplay
            color={opponentColor}
            hp={opponent.hp}
            myColor={currentColor}
          />
        </div>
      </div>

      {opponentSkillInfo && (
        <div className="ability-skill-tooltip ability-skill-tooltip-top">
          <strong>
            {lang === "en"
              ? ABILITY_SKILLS[opponentSkillInfo].name.en
              : ABILITY_SKILLS[opponentSkillInfo].name.kr}
          </strong>
          <span>
            {lang === "en"
              ? ABILITY_SKILLS[opponentSkillInfo].description.en
              : ABILITY_SKILLS[opponentSkillInfo].description.kr}
          </span>
        </div>
      )}

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

        <div className="gs-grid-area" ref={gridAreaRef}>
          <AbilityGrid
            state={state}
            currentColor={currentColor}
            myPath={myPath}
            setMyPath={updateMyPath}
            displayPositions={{ red: redDisplayPos, blue: blueDisplayPos }}
            hitFlags={hitFlags}
            explodingFlags={explodingFlags}
            collisionEffects={collisionEffects}
            activeGuards={activeGuards}
            previewStart={previewStart}
            movingPaths={movingPaths}
            cellSize={cellSize}
            isPlanning={canDrawPath}
            teleportTargetsVisible={pendingTeleport}
            onTeleportTargetSelect={handleTeleportTargetSelect}
          />
        </div>
      </div>

      <div
        className={`gs-player-card gs-self gs-color-${currentColor} gs-role-${me.role === "attacker" ? "atk" : "run"}`}
      >
        <div
          className={`gs-role-badge gs-role-badge-self gs-role-badge-${me.role === "attacker" ? "atk" : "run"}`}
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
        <div className="gs-player-mid">
          <PlayerInfo player={me} isMe={true} />
          <span className="gs-color-tag">
            {currentColor === "red" ? "RED" : "BLUE"}
          </span>
        </div>
        <div className="gs-hp-slot">
          <HpDisplay color={currentColor} hp={me.hp} myColor={currentColor} />
        </div>
      </div>

      <div className="gs-path-bar">
        <div className="gs-path-header">
          <span className="gs-path-label">
            {lang === "en" ? "Path Points" : "경로 포인트"}
          </span>
          <span className="gs-path-count">
            <span className="gs-path-current">{myPath.length}</span>
            <span className="gs-path-sep"> / </span>
            <span className="gs-path-max">{state.pathPoints}</span>
          </span>
        </div>
        <div className="gs-path-gauge">
          {Array.from({ length: state.pathPoints }, (_, index) => (
            <div
              key={index}
              className={`gs-path-seg${index < myPath.length ? " filled" : ""}`}
            />
          ))}
        </div>
      </div>

      <div className="ability-skill-panel">
        <div className="ability-skill-panel-head">
          <strong>{lang === "en" ? "Skills" : "스킬"}</strong>
        </div>
        <div className="ability-skill-buttons">
          {getAvailableSkills().map((skillId) => {
            const skill = ABILITY_SKILLS[skillId];
            const reserved = skillReservations.some(
              (entry) => entry.skillId === skillId,
            );
            const roleBlocked =
              (skillId === "classic_guard" && getMyRole() !== "escaper") ||
              (skillId === "ember_blast" && getMyRole() !== "attacker");
            const disabled =
              !isPlanning ||
              mySubmitted ||
              roleBlocked ||
              (getRemainingMana() < skill.manaCost && !reserved);
            return (
              <button
                key={skillId}
                type="button"
                className={`ability-skill-btn ${reserved ? "is-selected" : ""} ${selectedSkillId === skillId ? "is-active" : ""}`}
                disabled={disabled}
                onClick={() => handleSkillClick(skillId)}
              >
                <span className="ability-skill-icon">{skill.icon}</span>
                <span className="ability-skill-name">
                  {lang === "en" ? skill.name.en : skill.name.kr}
                </span>
                <span className="ability-skill-cost">{skill.manaCost}</span>
              </button>
            );
          })}
        </div>
        <div className="ability-mana-row">
          <div className="ability-mana-bar">
            {Array.from({ length: 10 }, (_, index) => (
              <span
                key={index}
                className={`ability-mana-pip ${index < getMyMana() ? "is-filled" : ""}`}
              />
            ))}
          </div>
          <span className="ability-mana-text">
            {lang === "en" ? `Mana ${getMyMana()} / 10` : `마나 ${getMyMana()} / 10`}
          </span>
        </div>
        {pendingExplosionStep && (
          <div className="ability-step-picker">
            <span>
              {lang === "en" ? "Select trigger step" : "발동 시점 선택"}
            </span>
            <div className="ability-step-picker-row">
              {Array.from({ length: myPath.length + 1 }, (_, index) => (
                <button
                  key={index}
                  type="button"
                  className="ability-step-chip"
                  onClick={() => handleExplosionStepSelect(index)}
                >
                  {index}
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="ability-reservation-list">
          {skillReservations.map((reservation) => {
            const skill = ABILITY_SKILLS[reservation.skillId];
            return (
              <button
                key={`${reservation.skillId}-${reservation.order}`}
                type="button"
                className="ability-reservation-chip"
                onClick={() => removeReservation(reservation.skillId)}
              >
                <span>{skill.icon}</span>
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
    </div>
  );
}
