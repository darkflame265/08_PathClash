import { useEffect, useRef, useState } from 'react';
import { getSocket } from '../../socket/socketClient';
import { registerSocketHandlers } from '../../socket/socketHandlers';
import { useGameStore } from '../../store/gameStore';
import { GameGrid } from './GameGrid';
import { TimerBar } from './TimerBar';
import { HpDisplay } from './HpDisplay';
import { PlayerInfo } from './PlayerInfo';
import { ChatPanel } from './ChatPanel';
import { GameOverOverlay } from './GameOverOverlay';
import './GameScreen.css';

interface Props {
  onLeaveToLobby: () => void;
}

// ── Adaptive scaling ────────────────────────────────────────────
// Measures the gs-grid-area element's available space with
// ResizeObserver so the grid and all UI chrome scale together.
// cellSize drives the grid; --gs-scale drives the CSS chrome.

const DEFAULT_CELL = 96;
const MIN_CELL = 52;
const MAX_CELL = 160;

function computeInitialCellSize(): number {
  // Width-only fast estimate before ResizeObserver fires.
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
      // Grid is square — constrain by the smaller of available W/H
      const squareSide = Math.min(width, height > 60 ? height : width);
      const next = Math.max(MIN_CELL, Math.min(MAX_CELL, squareSide / 5));
      setCellSize(next);
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [gridAreaRef]);

  return cellSize;
}

// ── Component ───────────────────────────────────────────────────
export function GameScreen({ onLeaveToLobby }: Props) {
  const { gameState, myColor, roundInfo, winner, myPath } = useGameStore();
  const gridAreaRef = useRef<HTMLDivElement>(null);
  const cellSize = useAdaptiveCellSize(gridAreaRef);
  const scale = cellSize / DEFAULT_CELL;

  useEffect(() => {
    const socket = getSocket();
    const cleanup = registerSocketHandlers(socket);
    return cleanup;
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);

  if (!gameState) return <div className="gs-loading">게임 로딩 중...</div>;

  const opponentColor = myColor === 'red' ? 'blue' : 'red';
  const me = myColor ? gameState.players[myColor] : null;
  const opponent = gameState.players[opponentColor];

  return (
    <div
      className="game-screen"
      style={{ '--gs-scale': scale } as React.CSSProperties}
    >

      {/* ── 유틸리티 바: 타이머 + 버튼 ─────────────────── */}
      <div className="gs-utility-bar">
        <div className="gs-timer-slot">
          {gameState.phase === 'planning' && roundInfo && (
            <TimerBar
              duration={roundInfo.timeLimit}
              serverStartTime={roundInfo.serverTime}
            />
          )}
          {gameState.phase === 'moving' && (
            <div className="gs-phase-moving">
              <span className="gs-moving-pip" />
              이동 중...
            </div>
          )}
        </div>
        <div className="gs-utility-buttons">
          <button className="gs-lobby-btn" onClick={onLeaveToLobby}>Lobby</button>
          <MuteButton />
        </div>
      </div>

      {/* ── 상대방 패널 ──────────────────────────────────── */}
      <div className={`gs-player-card gs-opponent gs-color-${opponentColor}`}>
        <div className="gs-role-badge">
          <span className="gs-role-icon">{opponent.role === 'attacker' ? '⚔' : '🏃'}</span>
          <span className="gs-role-label">{opponent.role === 'attacker' ? '공격' : '도망'}</span>
        </div>
        <div className="gs-player-mid">
          <PlayerInfo player={opponent} isMe={false} />
          <span className="gs-color-tag">{opponentColor === 'red' ? 'RED' : 'BLU'}</span>
        </div>
        <div className="gs-hp-slot">
          <HpDisplay color={opponentColor} hp={gameState.players[opponentColor].hp} myColor={myColor!} />
        </div>
      </div>

      {/* ── 그리드 ──────────────────────────────────────── */}
      {winner && (
        <div className="gs-result-slot">
          <GameOverOverlay winner={winner} myColor={myColor!} />
        </div>
      )}

      <div className="gs-grid-area" ref={gridAreaRef}>
        <GameGrid cellSize={cellSize} />
      </div>

      {/* ── 내 패널 ─────────────────────────────────────── */}
      <div className={`gs-player-card gs-self gs-color-${myColor}`}>
        <div className="gs-role-badge gs-role-badge-self">
          <span className="gs-role-icon">{me?.role === 'attacker' ? '⚔' : '🏃'}</span>
          <span className="gs-role-label">{me?.role === 'attacker' ? '공격' : '도망'}</span>
        </div>
        <div className="gs-player-mid">
          <PlayerInfo player={me!} isMe={true} />
          <span className="gs-color-tag">{myColor === 'red' ? 'RED' : 'BLU'}</span>
        </div>
        <div className="gs-hp-slot">
          <HpDisplay color={myColor!} hp={me?.hp ?? 3} myColor={myColor!} />
        </div>
      </div>

      {/* ── 경로 포인트 게이지 ───────────────────────────── */}
      <PathProgressBar current={myPath.length} max={gameState.pathPoints} />

      <ChatPanel />
    </div>
  );
}

/* ── 경로 진행 게이지 ─────────────────────────────────────── */
function PathProgressBar({ current, max }: { current: number; max: number }) {
  const isFull = current >= max;

  return (
    <div className={`gs-path-bar${isFull ? ' gs-path-full' : ''}`}>
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
            className={`gs-path-seg${i < current ? ' filled' : ''}${i === current - 1 ? ' latest' : ''}`}
          />
        ))}
      </div>
    </div>
  );
}

/* ── 음소거 버튼 ──────────────────────────────────────────── */
function MuteButton() {
  const { isMuted, toggleMute } = useGameStore();
  return (
    <button className="gs-mute-btn" onClick={toggleMute} title={isMuted ? '음소거 해제' : '음소거'}>
      {isMuted ? '🔇' : '🔊'}
    </button>
  );
}
