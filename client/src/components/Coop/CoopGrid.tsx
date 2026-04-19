import { useRef, useCallback, useEffect, useState } from "react";
import { useGameStore } from "../../store/gameStore";
import { getSocket } from "../../socket/socketClient";
import { getEstimatedServerNow } from "../../socket/timeSync";
import type { Position } from "../../types/game.types";
import type { CoopClientState, CoopEnemyPreview, CoopPortal, CoopRoundStartPayload } from "../../types/coop.types";
import { isBlockedCell, isValidMove, pixelToCell, posEqual } from "../../utils/pathUtils";
import { PlayerPiece } from "../Game/PlayerPiece";
import { PathLine } from "../Game/PathLine";
import { CollisionEffect } from "../Effects/CollisionEffect";
import { playPathStepClick } from "../../utils/soundUtils";
import "../Game/GameGrid.css";
import "./CoopScreen.css";

const DEFAULT_CELL_SIZE = 96;
const GRID_SIZE = 5;
const PRE_SUBMIT_LEAD_MS = 250;

interface Props {
  state: CoopClientState;
  myColor: 'red' | 'blue';
  myPath: Position[];
  allyPath: Position[];
  setMyPath: (path: Position[]) => void;
  setMySubmitted: () => void;
  roundInfo: CoopRoundStartPayload | null;
  redDisplayPos: Position;
  blueDisplayPos: Position;
  enemyDisplayPositions: Record<string, Position>;
  portals: CoopPortal[];
  movingEnemyPaths: CoopEnemyPreview[] | null;
  hitPortalIds: string[];
}

function EnemyPathLayer({ paths, cellSize }: { paths: CoopEnemyPreview[]; cellSize: number }) {
  return (
    <svg
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2, overflow: 'visible' }}
      width="100%"
      height="100%"
    >
      {paths.map((enemy) => {
        if (enemy.path.length === 0) return null;
        const points = [enemy.start, ...enemy.path]
          .map((p) => `${p.col * cellSize + cellSize / 2},${p.row * cellSize + cellSize / 2}`)
          .join(' ');
        return (
          <g key={enemy.id}>
            <polyline
              points={points}
              fill="none"
              stroke="#7e22ce"
              strokeWidth={Math.max(3, cellSize * 0.055)}
              strokeOpacity={0.85}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={`${Math.max(6, cellSize * 0.12)} ${Math.max(5, cellSize * 0.08)}`}
            />
            <circle
              cx={enemy.path[enemy.path.length - 1].col * cellSize + cellSize / 2}
              cy={enemy.path[enemy.path.length - 1].row * cellSize + cellSize / 2}
              r={Math.max(3, cellSize * 0.05)}
              fill="#c026d3"
              fillOpacity={0.9}
            />
          </g>
        );
      })}
    </svg>
  );
}

export function CoopGrid({
  state,
  myColor,
  myPath,
  allyPath,
  setMyPath,
  setMySubmitted,
  roundInfo,
  redDisplayPos,
  blueDisplayPos,
  enemyDisplayPositions,
  portals,
  movingEnemyPaths,
  hitPortalIds,
}: Props) {
  const { hitEffect, collisionEffects, explosionEffect, isSfxMuted, sfxVolume } = useGameStore();
  const shellRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [boardSize, setBoardSize] = useState(DEFAULT_CELL_SIZE * GRID_SIZE);
  const [hoveredCell, setHoveredCell] = useState<Position | null>(null);
  const dragState = useRef<{ active: boolean; fromPiece: boolean; fromEnd: boolean }>({
    active: false,
    fromPiece: false,
    fromEnd: false,
  });

  const isPlanning = state.phase === 'planning';
  const myPlayerAlive = state.players[myColor].hp > 0;
  const canPlan = isPlanning && myPlayerAlive;
  const myPos = state.players[myColor].position;
  const obstacles = state.obstacles;

  useEffect(() => {
    const element = shellRef.current;
    if (!element) return;
    const updateSize = (width: number, height: number) => {
      const side = Math.min(width, height > 60 ? height : width);
      if (!side) return;
      setBoardSize(side * 0.92);
    };
    const rect = element.getBoundingClientRect();
    updateSize(rect.width, rect.height);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      updateSize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const responsiveCellSize = boardSize / GRID_SIZE;

  const getGridOffset = () => {
    const rect = gridRef.current?.getBoundingClientRect();
    return rect ? { x: rect.left, y: rect.top } : { x: 0, y: 0 };
  };

  const playPathStepSfx = useCallback(() => {
    if (isSfxMuted) return;
    playPathStepClick(sfxVolume);
  }, [isSfxMuted, sfxVolume]);

  const addToPath = useCallback(
    (cell: Position) => {
      if (!canPlan) return;
      const current = myPath;
      if (current.length >= state.pathPoints) return;
      if (isBlockedCell(cell, obstacles)) return;
      const lastPos = current.length > 0 ? current[current.length - 1] : myPos;
      if (isValidMove(lastPos, cell)) {
        playPathStepSfx();
        setMyPath([...current, cell]);
      }
    },
    [canPlan, myPath, myPos, playPathStepSfx, setMyPath, state.pathPoints],
  );

  const removeFromPath = useCallback(() => {
    if (myPath.length > 0) {
      playPathStepSfx();
      setMyPath(myPath.slice(0, -1));
    }
  }, [myPath, playPathStepSfx, setMyPath]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!canPlan || !gridRef.current) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const cell = pixelToCell(e.clientX, e.clientY, responsiveCellSize, getGridOffset());
      if (!cell) return;
      setHoveredCell(cell);
      const isOnPiece = posEqual(cell, myPos) && myPath.length === 0;
      const isOnEnd = myPath.length > 0 && posEqual(cell, myPath[myPath.length - 1]);
      const isOnPieceWithPath = posEqual(cell, myPos);
      if (isOnPiece || isOnPieceWithPath) {
        dragState.current = { active: true, fromPiece: true, fromEnd: false };
      } else if (isOnEnd) {
        dragState.current = { active: true, fromPiece: false, fromEnd: true };
      }
      if (dragState.current.active) {
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
      }
    },
    [canPlan, myPath, myPos, responsiveCellSize],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const cell = pixelToCell(e.clientX, e.clientY, responsiveCellSize, getGridOffset());
      setHoveredCell(cell);
      if (!dragState.current.active || !canPlan || !cell) return;
      e.preventDefault();
      const current = myPath;
      if (current.length > 0) {
        const secondLast = current.length >= 2 ? current[current.length - 2] : myPos;
        if (posEqual(cell, secondLast)) {
          dragState.current = { active: true, fromPiece: false, fromEnd: true };
          removeFromPath();
          return;
        }
      }
      if (dragState.current.fromEnd) {
        const lastPos = current.length > 0 ? current[current.length - 1] : myPos;
        if (
          !posEqual(cell, lastPos) &&
          !isBlockedCell(cell, obstacles) &&
          isValidMove(lastPos, cell) &&
          current.length < state.pathPoints
        ) {
          playPathStepSfx();
          setMyPath([...current, cell]);
        }
      } else if (dragState.current.fromPiece) {
        addToPath(cell);
      }
    },
    [addToPath, canPlan, myPath, myPos, playPathStepSfx, removeFromPath, responsiveCellSize, setMyPath, state.pathPoints],
  );

  const handlePointerEnd = useCallback((e?: React.PointerEvent<HTMLDivElement>) => {
    if (e?.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setHoveredCell(null);
    dragState.current = { active: false, fromPiece: false, fromEnd: false };
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!canPlan) return;
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      const dirs: Record<string, Position> = {
        ArrowUp: { row: -1, col: 0 },
        ArrowDown: { row: 1, col: 0 },
        ArrowLeft: { row: 0, col: -1 },
        ArrowRight: { row: 0, col: 1 },
      };
      const dir = dirs[e.key];
      if (!dir) return;
      e.preventDefault();
      const lastPos = myPath.length > 0 ? myPath[myPath.length - 1] : myPos;
      const next = { row: lastPos.row + dir.row, col: lastPos.col + dir.col };
      if (next.row < 0 || next.row > 4 || next.col < 0 || next.col > 4) return;
      if (isBlockedCell(next, obstacles)) return;
      if (myPath.length > 0) {
        const secondLast = myPath.length >= 2 ? myPath[myPath.length - 2] : myPos;
        if (posEqual(next, secondLast)) {
          removeFromPath();
          return;
        }
      }
      if (myPath.length >= state.pathPoints) return;
      if (isValidMove(lastPos, next)) {
        playPathStepSfx();
        setMyPath([...myPath, next]);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [canPlan, myPath, myPos, obstacles, playPathStepSfx, removeFromPath, setMyPath, state.pathPoints]);

  useEffect(() => {
    if (!canPlan || !roundInfo || state.players[myColor].pathSubmitted) return;
    const submitAtMs = roundInfo.roundEndsAt;
    const preSubmitDelayMs = Math.max(
      0,
      submitAtMs - getEstimatedServerNow() - PRE_SUBMIT_LEAD_MS,
    );
    const finalSubmitDelayMs = Math.max(
      0,
      submitAtMs - getEstimatedServerNow(),
    );

    const submitCurrentPath = () => {
      if (state.phase !== 'planning' || !myPlayerAlive || state.players[myColor].pathSubmitted) return;
      getSocket().emit('coop_submit_path', { path: myPath }, ({ ok }: { ok: boolean }) => {
        if (!ok) return;
        setMySubmitted();
      });
    };

    const preSubmitTimeoutId = window.setTimeout(submitCurrentPath, preSubmitDelayMs);
    const finalSubmitTimeoutId = window.setTimeout(submitCurrentPath, finalSubmitDelayMs);

    return () => {
      window.clearTimeout(preSubmitTimeoutId);
      window.clearTimeout(finalSubmitTimeoutId);
    };
  }, [canPlan, myColor, myPath, myPlayerAlive, roundInfo, setMySubmitted, state]);

  const cells = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => ({
    row: Math.floor(i / GRID_SIZE),
    col: i % GRID_SIZE,
  }));

  const visibleEnemyPaths = state.phase === 'planning' ? state.enemyPreviews : (movingEnemyPaths ?? []);
  const redPath = myColor === 'red' ? myPath : allyPath;
  const bluePath = myColor === 'blue' ? myPath : allyPath;

  return (
    <div ref={shellRef} className="game-grid-shell">
      <div
        ref={gridRef}
        className="game-grid coop-grid"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerLeave={() => setHoveredCell(null)}
        style={{ width: boardSize, height: boardSize }}
      >
        {cells.map(({ row, col }) => (
          <div
            key={`${row}-${col}`}
            className={`grid-cell ${isBlockedCell({ row, col }, obstacles) ? "obstacle" : ""} ${
              hoveredCell?.row === row && hoveredCell?.col === col ? "is-hovered" : ""
            }`}
            style={{
              left: col * responsiveCellSize,
              top: row * responsiveCellSize,
              width: responsiveCellSize,
              height: responsiveCellSize,
              ['--cell-size' as string]: `${responsiveCellSize}px`,
            }}
          >
            {isBlockedCell({ row, col }, obstacles) && <div className="obstacle-mark" />}
          </div>
        ))}

        <EnemyPathLayer paths={visibleEnemyPaths} cellSize={responsiveCellSize} />
        <PathLine
          color="red"
          path={redPath}
          startPos={state.players.red.position}
          cellSize={responsiveCellSize}
          isPlanning={isPlanning}
        />
        <PathLine
          color="blue"
          path={bluePath}
          startPos={state.players.blue.position}
          cellSize={responsiveCellSize}
          isPlanning={isPlanning}
        />

        {collisionEffects.map(({ id, position }) => (
          <CollisionEffect
            key={id}
            position={position}
            cellSize={responsiveCellSize}
          />
        ))}

        {portals.map((portal) => (
          <div
            key={portal.id}
            className={`coop-portal coop-portal-${portal.color}${hitPortalIds.includes(portal.id) ? ' hit' : ''}`}
            style={{
              left: portal.position.col * responsiveCellSize + responsiveCellSize / 2,
              top: portal.position.row * responsiveCellSize + responsiveCellSize / 2,
              width: Math.max(26, responsiveCellSize * 0.52),
              height: Math.max(26, responsiveCellSize * 0.52),
            }}
          >
            <span className="coop-portal-core" />
            <span className="coop-portal-hp">{portal.hp}</span>
          </div>
        ))}

        {Object.entries(enemyDisplayPositions).map(([enemyId, position]) => (
          <div
            key={enemyId}
            className="coop-enemy"
            style={{
              left: position.col * responsiveCellSize + responsiveCellSize / 2,
              top: position.row * responsiveCellSize + responsiveCellSize / 2,
              width: Math.max(24, responsiveCellSize * 0.46),
              height: Math.max(24, responsiveCellSize * 0.46),
            }}
          >
            <span className="coop-enemy-core" />
          </div>
        ))}

        {(state.players.red.hp > 0 || hitEffect.red || explosionEffect === "red") && (
          <PlayerPiece
            color="red"
            position={redDisplayPos}
            cellSize={responsiveCellSize}
            isAttacker={false}
            isHit={hitEffect.red}
            isExploding={explosionEffect === "red"}
            isMe={myColor === 'red'}
            skin={state.players.red.pieceSkin}
          />
        )}
        {(state.players.blue.hp > 0 || hitEffect.blue || explosionEffect === "blue") && (
          <PlayerPiece
            color="blue"
            position={blueDisplayPos}
            cellSize={responsiveCellSize}
            isAttacker={false}
            isHit={hitEffect.blue}
            isExploding={explosionEffect === "blue"}
            isMe={myColor === 'blue'}
            skin={state.players.blue.pieceSkin}
          />
        )}
      </div>
    </div>
  );
}
