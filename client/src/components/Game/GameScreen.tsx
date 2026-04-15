import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { getSocket } from "../../socket/socketClient";
import { registerSocketHandlers } from "../../socket/socketHandlers";
import { useGameStore } from "../../store/gameStore";
import { useLang } from "../../hooks/useLang";
import { GameGrid } from "./GameGrid";
import { GameOverOverlay } from "./GameOverOverlay";
import { HpDisplay } from "./HpDisplay";
import { PlayerInfo } from "./PlayerInfo";
import { TimerBar } from "./TimerBar";
import type { BoardSkin, Position } from "../../types/game.types";
import {
  playMatchResultSfx,
  startMatchResultBgm,
  stopMatchResultBgm,
} from "../../utils/soundUtils";
import "./GameScreen.css";

interface Props {
  onLeaveToLobby: () => void;
}

const DEFAULT_CELL = 96;
const MIN_CELL = 52;
const MAX_CELL = 160;
// 태블릿 letterbox 컨테이너(520px)에서 폰과 동일한 체감 스케일 유지
// 430px(iPhone Pro Max)에서의 scale≈0.85를 상한으로 설정
const MAX_SCALE = 0.85;
// 태블릿 game 모드 app-inner max-width와 맞춤 — window.innerWidth 대신 이 값으로 초기값 계산
const CONTAINER_MAX_WIDTH = 430;
const AI_TUTORIAL_SEEN_KEY = "pathclash.aiTutorialSeen.v1";
type TutorialStep =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14;

function buildTutorialGuidePath(
  start: Position,
  end: Position,
  obstacles: Position[],
): Position[] {
  const key = (position: Position) => `${position.row},${position.col}`;
  const blocked = new Set(obstacles.map(key));
  const queue: Position[] = [{ ...start }];
  const visited = new Set([key(start)]);
  const prev = new Map<string, Position | null>();
  prev.set(key(start), null);
  const dirs = [
    { row: -1, col: 0 },
    { row: 1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.row === end.row && current.col === end.col) {
      const path: Position[] = [];
      let cursor: Position | null = current;
      while (cursor) {
        path.push(cursor);
        cursor = prev.get(key(cursor)) ?? null;
      }
      return path.reverse();
    }

    for (const dir of dirs) {
      const next = {
        row: current.row + dir.row,
        col: current.col + dir.col,
      };
      if (next.row < 0 || next.row >= 5 || next.col < 0 || next.col >= 5) {
        continue;
      }
      const nextKey = key(next);
      if (visited.has(nextKey) || blocked.has(nextKey)) continue;
      visited.add(nextKey);
      prev.set(nextKey, current);
      queue.push(next);
    }
  }

  return [start, end];
}

function computeInitialCellSize(): number {
  // window.innerWidth가 아닌 컨테이너 제약(520px)을 기준으로 초기값 계산
  // 태블릿에서 scale이 폰보다 크게 시작되는 것을 방지
  const cappedW = Math.min(window.innerWidth, CONTAINER_MAX_WIDTH);
  const availW = Math.max(260, cappedW - 24);
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

function getRoleIcon(role: "attacker" | "escaper") {
  return role === "attacker" ? "ATK" : "RUN";
}

export function GameScreen({ onLeaveToLobby }: Props) {
  const {
    gameState,
    myColor,
    roundInfo,
    winner,
    myPath,
    gameOverMessage,
    rematchRequestSent,
    setRematchRequestSent,
    currentMatchType,
    accountDailyRewardTokens,
    boardSkin,
    isSfxMuted,
    sfxVolume,
  } = useGameStore();
  const { t, lang } = useLang();
  const gridAreaRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const selfRoleBadgeRef = useRef<HTMLDivElement>(null);
  const pathBarRef = useRef<HTMLDivElement>(null);
  const cellSize = useAdaptiveCellSize(gridAreaRef);
  // 보드 크기(cellSize)는 컨테이너 너비에 맞게 자유롭게 커지되,
  // HUD/UI에 적용되는 scale은 폰 최대(iPhone Pro Max)와 동일한 수준으로 제한
  const scale = Math.min(cellSize / DEFAULT_CELL, MAX_SCALE);
  const [tutorialStep, setTutorialStep] = useState<TutorialStep>(0);
  const [roleTutorialPos, setRoleTutorialPos] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [pathBarTutorialPos, setPathBarTutorialPos] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [showEntranceAnimation, setShowEntranceAnimation] = useState(true);
  const tutorialStartedRef = useRef(false);
  const resultAudioPlayedRef = useRef(false);

  useEffect(() => {
    const socket = getSocket();
    const cleanup = registerSocketHandlers(socket);
    socket.emit("game_client_ready");
    return cleanup;
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);

  useEffect(() => {
    setShowEntranceAnimation(true);
    const timeout = window.setTimeout(() => {
      setShowEntranceAnimation(false);
    }, 620);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!winner || !myColor) {
      resultAudioPlayedRef.current = false;
      stopMatchResultBgm();
      return;
    }

    if (resultAudioPlayedRef.current) return;

    const didWin = winner === myColor;
    if (!isSfxMuted) {
      playMatchResultSfx(didWin ? "victory" : "defeat", sfxVolume);
    }
    startMatchResultBgm(didWin ? "victory" : "defeat");
    resultAudioPlayedRef.current = true;
  }, [isSfxMuted, myColor, sfxVolume, winner]);

  useEffect(() => {
    return () => {
      stopMatchResultBgm();
    };
  }, []);

  useEffect(() => {
    if (currentMatchType !== "ai" || !gameState?.tutorialActive) {
      setTutorialStep(0);
      return;
    }

    const hasSeenTutorial =
      window.localStorage.getItem(AI_TUTORIAL_SEEN_KEY) === "1";
    setTutorialStep(hasSeenTutorial ? 0 : 1);
  }, [currentMatchType, gameState?.tutorialActive]);

  useEffect(() => {
    if (tutorialStep !== 2) {
      setRoleTutorialPos(null);
      return;
    }

    const updateRoleTutorialPosition = () => {
      const screenEl = screenRef.current;
      const badgeEl = selfRoleBadgeRef.current;
      if (!screenEl || !badgeEl) {
        setRoleTutorialPos(null);
        return;
      }

      const screenRect = screenEl.getBoundingClientRect();
      const badgeRect = badgeEl.getBoundingClientRect();
      setRoleTutorialPos({
        left: badgeRect.left - screenRect.left,
        top: badgeRect.top - screenRect.top - 8,
      });
    };

    updateRoleTutorialPosition();
    window.addEventListener("resize", updateRoleTutorialPosition);
    return () =>
      window.removeEventListener("resize", updateRoleTutorialPosition);
  }, [tutorialStep, gameState, myColor]);

  useEffect(() => {
    if (tutorialStep !== 5) {
      setPathBarTutorialPos(null);
      return;
    }

    const updatePathBarPos = () => {
      const screenEl = screenRef.current;
      const barEl = pathBarRef.current;
      if (!screenEl || !barEl) {
        setPathBarTutorialPos(null);
        return;
      }

      const screenRect = screenEl.getBoundingClientRect();
      const barRect = barEl.getBoundingClientRect();
      setPathBarTutorialPos({
        left: barRect.left - screenRect.left + barRect.width / 2,
        top: barRect.top - screenRect.top - 8,
      });
    };

    updatePathBarPos();
    window.addEventListener("resize", updatePathBarPos);
    return () => window.removeEventListener("resize", updatePathBarPos);
  }, [tutorialStep]);

  useEffect(() => {
    if (tutorialStep === 0) return;

    const dismissTutorialHint = () => {
      if (tutorialStep === 1) {
        setTutorialStep(2);
        return;
      }
      if (tutorialStep === 2) {
        setTutorialStep(3);
        return;
      }
      if (tutorialStep === 3) {
        setTutorialStep(4);
        return;
      }
      if (tutorialStep === 4) {
        setTutorialStep(5);
        return;
      }
      if (tutorialStep === 5) {
        setTutorialStep(6);
        return;
      }
      if (tutorialStep === 6) {
        setTutorialStep(7);
        return;
      }
    };

    window.addEventListener("pointerdown", dismissTutorialHint, true);
    return () =>
      window.removeEventListener("pointerdown", dismissTutorialHint, true);
  }, [tutorialStep]);

  useEffect(() => {
    if (
      currentMatchType !== "ai" ||
      tutorialStep !== 7 ||
      tutorialStartedRef.current
    ) {
      return;
    }
    tutorialStartedRef.current = true;
    getSocket().emit("resume_tutorial");
  }, [currentMatchType, tutorialStep]);

  useEffect(() => {
    if (currentMatchType !== "ai" || !roundInfo?.tutorialScenario) return;
    if (roundInfo.tutorialScenario === "escape" && tutorialStep < 8) {
      setTutorialStep(8);
      return;
    }
    if (roundInfo.tutorialScenario === "predict" && tutorialStep < 9) {
      setTutorialStep(9);
      return;
    }
    if (
      roundInfo.tutorialScenario === "predict_obstacle" &&
      tutorialStep < 10
    ) {
      setTutorialStep(10);
      return;
    }
    if (roundInfo.tutorialScenario === "predict_wall" && tutorialStep < 11) {
      setTutorialStep(11);
      return;
    }
    if (roundInfo.tutorialScenario === "overlap_escape" && tutorialStep < 12) {
      setTutorialStep(12);
      return;
    }
    if (roundInfo.tutorialScenario === "chain_attack" && tutorialStep < 13) {
      setTutorialStep(13);
      return;
    }
    if (
      roundInfo.tutorialScenario === "freeplay" &&
      tutorialStep !== 0 &&
      tutorialStep < 14
    ) {
      setTutorialStep(14);
      return;
    }
    if (roundInfo.tutorialScenario === "chain_attack" && tutorialStep === 14) {
      setTutorialStep(13);
      return;
    }
    if (roundInfo.tutorialScenario === "freeplay" && tutorialStep === 13) {
      setTutorialStep(14);
      return;
    }
    if (
      roundInfo.tutorialScenario === "freeplay" &&
      tutorialStep !== 0 &&
      tutorialStep < 14
    ) {
      setTutorialStep(14);
      return;
    }
    if (
      roundInfo.tutorialScenario === "predict_obstacle" &&
      tutorialStep === 11
    ) {
      setTutorialStep(10);
      return;
    }
    if (roundInfo.tutorialScenario === "predict_wall" && tutorialStep === 12) {
      setTutorialStep(11);
      return;
    }
    if (
      roundInfo.tutorialScenario === "overlap_escape" &&
      tutorialStep === 13
    ) {
      setTutorialStep(12);
      return;
    }
  }, [currentMatchType, roundInfo?.tutorialScenario, tutorialStep]);

  useEffect(() => {
    if (
      currentMatchType !== "ai" ||
      tutorialStep === 0 ||
      !winner ||
      !myColor ||
      winner !== myColor
    ) {
      return;
    }
    window.localStorage.setItem(AI_TUTORIAL_SEEN_KEY, "1");
    setTutorialStep(0);
  }, [currentMatchType, myColor, tutorialStep, winner]);

  useEffect(() => {
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

      if (event.key === "Escape") {
        event.preventDefault();
        onLeaveToLobby();
        return;
      }

      if (
        (event.key === "r" || event.key === "R") &&
        winner &&
        !gameOverMessage &&
        !rematchRequestSent
      ) {
        event.preventDefault();
        getSocket().emit("request_rematch");
        setRematchRequestSent(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    gameOverMessage,
    onLeaveToLobby,
    rematchRequestSent,
    setRematchRequestSent,
    winner,
  ]);

  if (!gameState) {
    return <div className="gs-loading">{t.loading}</div>;
  }

  const opponentColor = myColor === "red" ? "blue" : "red";
  const me = myColor ? gameState.players[myColor] : null;
  const opponent = gameState.players[opponentColor];
  const tutorialInProgress = currentMatchType === "ai" && tutorialStep !== 0;
  const tutorialHintAnchor = useMemo(() => {
    if (!myColor || !roundInfo) return null;
    if (
      tutorialStep === 7 ||
      tutorialStep === 8 ||
      tutorialStep === 9 ||
      tutorialStep === 10 ||
      tutorialStep === 11
    ) {
      return myColor === "red" ? roundInfo.redPosition : roundInfo.bluePosition;
    }
    return null;
  }, [myColor, roundInfo, tutorialStep]);
  const tutorialGuidePath = useMemo(() => {
    if (!myColor || !me || gameState.phase !== "planning") {
      return null;
    }
    const start = gameState.players[myColor].position;
    if (tutorialStep === 7) {
      const end = gameState.players[opponentColor].position;
      const alreadyReached = myPath.some(
        (position) => position.row === end.row && position.col === end.col,
      );
      if (alreadyReached) return null;
      return buildTutorialGuidePath(start, end, gameState.obstacles);
    }

    if (tutorialStep !== 8) {
      if (tutorialStep !== 13) {
        return null;
      }

      const guidePath = [
        start,
        { row: Math.max(0, start.row - 1), col: start.col },
        { row: Math.max(0, start.row - 1), col: Math.max(0, start.col - 1) },
        { row: start.row, col: Math.max(0, start.col - 1) },
        { row: start.row, col: Math.max(0, start.col - 2) },
        { row: Math.min(4, start.row + 1), col: Math.max(0, start.col - 2) },
      ];
      const last = guidePath[guidePath.length - 1];
      const alreadyReached =
        myPath.length >= guidePath.length - 1 &&
        myPath[myPath.length - 1]?.row === last.row &&
        myPath[myPath.length - 1]?.col === last.col;
      return alreadyReached ? null : guidePath;
    }

    const end = {
      row: Math.max(0, start.row - 2),
      col: start.col,
    };
    const alreadyReached =
      myPath.length >= 2 &&
      myPath[myPath.length - 1]?.row === end.row &&
      myPath[myPath.length - 1]?.col === end.col;
    if (alreadyReached) return null;
    return buildTutorialGuidePath(start, end, gameState.obstacles);
  }, [
    gameState.obstacles,
    gameState.phase,
    gameState.players,
    me,
    myColor,
    myPath,
    opponentColor,
    tutorialStep,
  ]);
  const dailyRewardRemaining = Math.max(0, 120 - accountDailyRewardTokens);
  const winRewardTokens =
    winner && myColor && winner === myColor && currentMatchType === "random"
      ? Math.min(6, dailyRewardRemaining)
      : null;
  const tutorialRematchAllowed =
    currentMatchType !== "ai" || !roundInfo?.tutorialScenario;
  const useLobbyResultAction =
    currentMatchType === "friend" || currentMatchType === "random";
  const showFriendRematchAction = currentMatchType === "friend";
  const resolvedBoardSkin: BoardSkin = (() => {
    if (gameState?.tutorialActive) return "classic";
    const redBoardSkin = gameState?.players.red.boardSkin;
    const blueBoardSkin = gameState?.players.blue.boardSkin;
    if (redBoardSkin && redBoardSkin !== "classic") return redBoardSkin;
    if (blueBoardSkin && blueBoardSkin !== "classic") return blueBoardSkin;
    return boardSkin;
  })();
  const screenBoardClass =
    resolvedBoardSkin === "pharaoh"
      ? "board-bg-pharaoh-screen"
      : resolvedBoardSkin === "magic"
        ? "board-bg-magic-screen"
        : "";

  return (
    <div
      className={`game-screen ${screenBoardClass}`}
      style={{ "--gs-scale": scale } as CSSProperties}
      ref={screenRef}
    >
      <div className="gs-utility-bar">
        <div className="gs-timer-slot">
          {gameState.phase === "planning" &&
            roundInfo &&
            !tutorialInProgress && (
              <TimerBar
                duration={roundInfo.timeLimit}
                roundEndsAt={roundInfo.roundEndsAt}
              />
            )}
          {gameState.phase === "moving" && (
            <div className="gs-phase-moving">
              <span className="gs-moving-pip" />
              {t.moving}
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
        <div className="gs-role-badge">
          <span className="gs-role-icon">{getRoleIcon(opponent.role)}</span>
          <span className="gs-role-label">
            {opponent.role === "attacker" ? t.roleAttack : t.roleEscape}
          </span>
        </div>
        <div className="gs-player-mid">
          <PlayerInfo player={opponent} isMe={false} />
          <span className="gs-color-tag">
            {opponentColor === "red" ? "RED" : "BLUE"}
          </span>
        </div>
        <div className="gs-hp-slot">
          <HpDisplay
            color={opponentColor}
            hp={gameState.players[opponentColor].hp}
            myColor={myColor!}
          />
        </div>
      </div>

      <div className="gs-board-stage">
        {winner && (
          <div className="gs-result-slot">
            <GameOverOverlay
              winner={winner}
              myColor={myColor!}
              rewardTokens={winRewardTokens}
              allowRematch={tutorialRematchAllowed}
              actionLabel={
                useLobbyResultAction ? (lang === "en" ? "LOBBY" : "로비") : null
              }
              onAction={useLobbyResultAction ? onLeaveToLobby : null}
              alignActionRight={useLobbyResultAction}
              showActionWithRematch={showFriendRematchAction}
              rematchButtonTone={showFriendRematchAction ? "blue" : "green"}
            />
          </div>
        )}

        <div className="gs-grid-area" ref={gridAreaRef}>
          <GameGrid
            entranceAnimation={showEntranceAnimation}
            cellSize={cellSize}
            tutorialHint={
              tutorialStep === 3
                ? t.attackCollisionTutorialHint
                : tutorialStep === 4
                  ? t.escapePredictionTutorialHint
                  : tutorialStep === 7
                    ? t.dragPathTutorial
                    : tutorialStep === 8
                      ? t.escapeRoleDragTutorial
                      : tutorialStep === 9
                        ? t.predictPathTutorial
                        : tutorialStep === 10
                          ? t.predictObstacleTutorial
                          : tutorialStep === 11
                            ? t.predictPathTutorial
                            : tutorialStep === 12
                              ? t.predictObstacleTutorial
                              : tutorialStep === 13
                                ? (t.chainAttackTutorial ??
                                  "잘했습니다! 이번엔 마지막 상황입니다!\npathclash에서는 경로가 겹칠 경우, 연속 충돌 판정이 일어납니다.\n당신의 역할은 공격입니다.\n상대의 경로를 예측하여, 상대에게 3 이상의 연속피해를 입히세요!")
                                : null
            }
            tutorialHintTarget={tutorialStep === 4 ? "opponent" : "self"}
            tutorialHintAnchor={tutorialHintAnchor}
            tutorialHintCentered={
              tutorialStep === 10 ||
              tutorialStep === 11 ||
              tutorialStep === 12 ||
              tutorialStep === 13
            }
            tutorialHintBottom={tutorialStep === 10 || tutorialStep === 13}
            tutorialHintAbove={tutorialStep === 9}
            tutorialGuidePath={tutorialGuidePath}
            tutorialAutoSubmit={tutorialInProgress}
          />
        </div>
      </div>

      <div
        className={`gs-player-card gs-self gs-color-${myColor} gs-role-${me?.role === "attacker" ? "atk" : "run"}`}
      >
        <div
          ref={selfRoleBadgeRef}
          className={`gs-role-badge gs-role-badge-self gs-role-badge-${me?.role === "attacker" ? "atk" : "run"}`}
        >
          <span className="gs-role-icon">
            {getRoleIcon(me?.role ?? "escaper")}
          </span>
          <span className="gs-role-label">
            {(me?.role ?? "escaper") === "attacker"
              ? t.roleAttack
              : t.roleEscape}
          </span>
        </div>
        <div className="gs-player-mid">
          <PlayerInfo player={me!} isMe={true} />
          <span className="gs-color-tag">
            {myColor === "red" ? "RED" : "BLUE"}
          </span>
        </div>
        <div className="gs-hp-slot">
          <HpDisplay color={myColor!} hp={me?.hp ?? 3} myColor={myColor!} />
        </div>
      </div>

      <div ref={pathBarRef}>
        <PathProgressBar
          current={myPath.length}
          max={gameState.pathPoints}
          pathPointsLabel={t.pathPoints}
        />
      </div>
      {tutorialStep === 1 && (
        <div
          className="ai-tutorial-hint no-arrow"
          style={{
            left: "50%",
            top: "42%",
            transform: "translate(-50%, -50%)",
            animation: "tutorial-hint-in-center 0.22s ease-out",
          }}
        >
          {t.introTutorialHint}
        </div>
      )}
      {tutorialStep === 2 && roleTutorialPos && (
        <div
          className="ai-tutorial-hint no-arrow"
          style={{
            left: roleTutorialPos.left,
            top: roleTutorialPos.top,
            transform: "translate(0, -100%)",
            animation: "tutorial-hint-in-for-two 0.22s ease-out",
          }}
        >
          {t.roleTutorialHint}
        </div>
      )}
      {tutorialStep === 5 && pathBarTutorialPos && (
        <div
          className="ai-tutorial-hint arrow-down"
          style={{
            left: pathBarTutorialPos.left,
            top: pathBarTutorialPos.top,
          }}
        >
          {t.pathPointsTutorialHint}
        </div>
      )}
      {tutorialStep === 6 && (
        <div
          className="ai-tutorial-hint ai-tutorial-hint-center no-arrow"
          style={{
            left: "50%",
            top: "42%",
            transform: "translate(-50%, -50%)",
          }}
        >
          {t.winConditionTutorialHint}
        </div>
      )}
    </div>
  );
}

function PathProgressBar({
  current,
  max,
  pathPointsLabel,
}: {
  current: number;
  max: number;
  pathPointsLabel: string;
}) {
  const isFull = current >= max;

  return (
    <div className={`gs-path-bar${isFull ? " gs-path-full" : ""}`}>
      <div className="gs-path-header">
        <span className="gs-path-label">{pathPointsLabel}</span>
        <span className="gs-path-count">
          <span className="gs-path-current">{current}</span>
          <span className="gs-path-sep"> / </span>
          <span className="gs-path-max">{max}</span>
        </span>
      </div>
      <div className="gs-path-gauge">
        {Array.from({ length: max }, (_, i) => (
          <div
            key={i}
            className={`gs-path-seg${i < current ? " filled" : ""}${i === current - 1 ? " latest" : ""}`}
          />
        ))}
      </div>
    </div>
  );
}
