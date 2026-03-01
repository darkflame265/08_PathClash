import { useEffect, useRef, useState, type CSSProperties } from "react";
import { getSocket } from "../../socket/socketClient";
import { registerSocketHandlers } from "../../socket/socketHandlers";
import { useGameStore } from "../../store/gameStore";
import { ChatPanel } from "./ChatPanel";
import { GameGrid } from "./GameGrid";
import { GameOverOverlay } from "./GameOverOverlay";
import { HpDisplay } from "./HpDisplay";
import { PlayerInfo } from "./PlayerInfo";
import { TimerBar } from "./TimerBar";
import "./GameScreen.css";

interface Props {
  onLeaveToLobby: () => void;
}

const DEFAULT_CELL = 96;
const MIN_CELL = 52;
const MAX_CELL = 160;

function computeInitialCellSize(): number {
  const availW = Math.max(260, window.innerWidth - 24);
  return Math.max(MIN_CELL, Math.min(MAX_CELL, availW / 5));
}

function useAdaptiveCellSize(gridAreaRef: React.RefObject<HTMLDivElement | null>) {
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

function getRoleLabel(role: "attacker" | "escaper") {
  return role === "attacker" ? "공격" : "도망";
}

export function GameScreen({ onLeaveToLobby }: Props) {
  const { gameState, myColor, roundInfo, winner, myPath, gameOverMessage, rematchRequestSent, setRematchRequestSent } = useGameStore();
  const gridAreaRef = useRef<HTMLDivElement>(null);
  const cellSize = useAdaptiveCellSize(gridAreaRef);
  const scale = cellSize / DEFAULT_CELL;

  useEffect(() => {
    const socket = getSocket();
    const cleanup = registerSocketHandlers(socket);
    return cleanup;
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);

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

      if ((event.key === "r" || event.key === "R") && winner && !gameOverMessage && !rematchRequestSent) {
        event.preventDefault();
        getSocket().emit("request_rematch");
        setRematchRequestSent(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [gameOverMessage, onLeaveToLobby, rematchRequestSent, setRematchRequestSent, winner]);

  if (!gameState) {
    return <div className="gs-loading">게임 로딩 중...</div>;
  }

  const opponentColor = myColor === "red" ? "blue" : "red";
  const me = myColor ? gameState.players[myColor] : null;
  const opponent = gameState.players[opponentColor];

  return (
    <div className="game-screen" style={{ "--gs-scale": scale } as CSSProperties}>
      <div className="gs-utility-bar">
        <div className="gs-timer-slot">
          {gameState.phase === "planning" && roundInfo && (
            <TimerBar duration={roundInfo.timeLimit} serverStartTime={roundInfo.serverTime} />
          )}
          {gameState.phase === "moving" && (
            <div className="gs-phase-moving">
              <span className="gs-moving-pip" />
              이동 중...
            </div>
          )}
        </div>
        <div className="gs-utility-buttons">
          <button className="gs-lobby-btn" onClick={onLeaveToLobby}>
            Lobby
          </button>
          <MuteButton />
        </div>
      </div>

      <div className={`gs-player-card gs-opponent gs-color-${opponentColor}`}>
        <div className="gs-role-badge">
          <span className="gs-role-icon">{getRoleIcon(opponent.role)}</span>
          <span className="gs-role-label">{getRoleLabel(opponent.role)}</span>
        </div>
        <div className="gs-player-mid">
          <PlayerInfo player={opponent} isMe={false} />
          <span className="gs-color-tag">{opponentColor === "red" ? "RED" : "BLU"}</span>
        </div>
        <div className="gs-hp-slot">
          <HpDisplay color={opponentColor} hp={gameState.players[opponentColor].hp} myColor={myColor!} />
        </div>
      </div>

      <div className="gs-board-stage">
        {winner && (
          <div className="gs-result-slot">
            <GameOverOverlay winner={winner} myColor={myColor!} />
          </div>
        )}

        <div className="gs-grid-area" ref={gridAreaRef}>
          <GameGrid cellSize={cellSize} />
        </div>
      </div>

      <div className={`gs-player-card gs-self gs-color-${myColor}`}>
        <div className="gs-role-badge gs-role-badge-self">
          <span className="gs-role-icon">{getRoleIcon(me?.role ?? "escaper")}</span>
          <span className="gs-role-label">{getRoleLabel(me?.role ?? "escaper")}</span>
        </div>
        <div className="gs-player-mid">
          <PlayerInfo player={me!} isMe={true} />
          <span className="gs-color-tag">{myColor === "red" ? "RED" : "BLU"}</span>
        </div>
        <div className="gs-hp-slot">
          <HpDisplay color={myColor!} hp={me?.hp ?? 3} myColor={myColor!} />
        </div>
      </div>

      <PathProgressBar current={myPath.length} max={gameState.pathPoints} />

      <ChatPanel />
    </div>
  );
}

function PathProgressBar({ current, max }: { current: number; max: number }) {
  const isFull = current >= max;

  return (
    <div className={`gs-path-bar${isFull ? " gs-path-full" : ""}`}>
      <div className="gs-path-header">
        <span className="gs-path-label">경로 포인트</span>
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

function MuteButton() {
  const { isMuted, toggleMute } = useGameStore();
  return (
    <button
      className="gs-mute-btn"
      onClick={toggleMute}
      title={isMuted ? "음소거 해제" : "음소거"}
    >
      {isMuted ? "Off" : "On"}
    </button>
  );
}
