import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { getSocket } from "../../socket/socketClient";
import { registerSocketHandlers } from "../../socket/socketHandlers";
import { useGameStore } from "../../store/gameStore";
import { useLang } from "../../hooks/useLang";
import { GameGrid } from "./GameGrid";
import { GameOverOverlay } from "./GameOverOverlay";
import { HpDisplay } from "./HpDisplay";
import { PlayerInfo } from "./PlayerInfo";
import { TimerBar } from "./TimerBar";
import type { Position } from "../../types/game.types";
import "./GameScreen.css";

interface Props {
  onLeaveToLobby: () => void;
}

const DEFAULT_CELL = 96;
const MIN_CELL = 52;
const MAX_CELL = 160;
const AI_TUTORIAL_SEEN_KEY = "pathclash.aiTutorialSeen.v1";
type TutorialStep = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

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
  } = useGameStore();
  const { t } = useLang();
  const gridAreaRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const selfRoleBadgeRef = useRef<HTMLDivElement>(null);
  const pathBarRef = useRef<HTMLDivElement>(null);
  const cellSize = useAdaptiveCellSize(gridAreaRef);
  const scale = cellSize / DEFAULT_CELL;
  const [tutorialStep, setTutorialStep] = useState<TutorialStep>(0);
  const [roleTutorialPos, setRoleTutorialPos] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [pathBarTutorialPos, setPathBarTutorialPos] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const tutorialStartedRef = useRef(false);

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
    if (currentMatchType !== "ai") {
      setTutorialStep(0);
      return;
    }

    const hasSeenTutorial =
      window.localStorage.getItem(AI_TUTORIAL_SEEN_KEY) === "1";
    setTutorialStep(hasSeenTutorial ? 0 : 1);
  }, [currentMatchType]);

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
        left: badgeRect.left - screenRect.left + badgeRect.width / 2,
        top: badgeRect.bottom - screenRect.top + 10,
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
    if (currentMatchType !== "ai" || tutorialStep !== 7 || tutorialStartedRef.current) {
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
    if (roundInfo.tutorialScenario === "freeplay" && tutorialStep !== 0 && tutorialStep < 9) {
      setTutorialStep(9);
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
  const tutorialGuidePath = useMemo(() => {
    if (
      (tutorialStep !== 7 && tutorialStep !== 8) ||
      !myColor ||
      !me ||
      gameState.phase !== "planning"
    ) {
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
  }, [gameState.obstacles, gameState.phase, gameState.players, me, myColor, myPath, opponentColor, tutorialStep]);
  const dailyRewardRemaining = Math.max(0, 120 - accountDailyRewardTokens);
  const winRewardTokens =
    winner && myColor && winner === myColor && currentMatchType === "random"
      ? Math.min(6, dailyRewardRemaining)
      : null;

  return (
    <div
      className="game-screen"
      style={{ "--gs-scale": scale } as CSSProperties}
      ref={screenRef}
    >
      <div className="gs-utility-bar">
        <div className="gs-timer-slot">
          {gameState.phase === "planning" && roundInfo && !tutorialInProgress && (
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
            />
          </div>
        )}

        <div className="gs-grid-area" ref={gridAreaRef}>
          <GameGrid
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
                  : null
            }
            tutorialHintTarget={tutorialStep === 4 ? "opponent" : "self"}
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
          }}
        >
          {t.introTutorialHint}
        </div>
      )}
      {tutorialStep === 2 && roleTutorialPos && (
        <div
          className="ai-tutorial-hint"
          style={{
            left: roleTutorialPos.left,
            top: roleTutorialPos.top,
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

