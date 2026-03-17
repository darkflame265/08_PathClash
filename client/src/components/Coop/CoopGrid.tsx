import { useRef, useCallback, useEffect, useState } from "react";
import { getSocket } from "../../socket/socketClient";
import type { Position } from "../../types/game.types";
import type { CoopClientState, CoopEnemyPreview, CoopPortal, CoopRoundStartPayload } from "../../types/coop.types";
import { isBlockedCell, isValidMove, pixelToCell, posEqual } from "../../utils/pathUtils";
import { PlayerPiece } from "../Game/PlayerPiece";
import { PathLine } from "../Game/PathLine";
import "../Game/GameGrid.css";
import "./CoopScreen.css";

const DEFAULT_CELL_SIZE = 96;
const GRID_SIZE = 5;
const PRE_SUBMIT_LEAD_MS = 250;
const PATH_UPDATE_THROTTLE_MS = 150;

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
  hitPlayers: { red: boolean; blue: boolean };
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
  hitPlayers,
}: Props) {
  const shellRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [boardSize, setBoardSize] = useState(DEFAULT_CELL_SIZE * GRID_SIZE);
  const lastPathUpdateAtRef = useRef(0);
  const pendingPathUpdateRef = useRef<number | null>(null);
  const pendingPathRef = useRef<Position[]>([]);
  const dragState = useRef<{ active: boolean; fromPiece: boolean; fromEnd: boolean }>({
    active: false,
    fromPiece: false,
    fromEnd: false,
  });

  const isPlanning = state.phase === 'planning';
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

  const emitPathUpdate = useCallback((path: Position[]) => {
    getSocket().emit('coop_path_update', { path });
    lastPathUpdateAtRef.current = Date.now();
  }, []);

  const flushPendingPathUpdate = useCallback(() => {
    if (pendingPathUpdateRef.current !== null) {
      window.clearTimeout(pendingPathUpdateRef.current);
      pendingPathUpdateRef.current = null;
    }
    emitPathUpdate(pendingPathRef.current);
  }, [emitPathUpdate]);

  const addToPath = useCallback(
    (cell: Position) => {
      if (!isPlanning) return;
      const current = myPath;
      if (current.length >= state.pathPoints) return;
      if (isBlockedCell(cell, obstacles)) return;
      const lastPos = current.length > 0 ? current[current.length - 1] : myPos;
      if (isValidMove(lastPos, cell)) {
        setMyPath([...current, cell]);
      }
    },
    [isPlanning, myPath, myPos, setMyPath, state.pathPoints],
  );

  const removeFromPath = useCallback(() => {
    if (myPath.length > 0) {
      setMyPath(myPath.slice(0, -1));
    }
  }, [myPath, setMyPath]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isPlanning || !gridRef.current) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const cell = pixelToCell(e.clientX, e.clientY, responsiveCellSize, getGridOffset());
      if (!cell) return;
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
    [isPlanning, myPath, myPos, responsiveCellSize],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragState.current.active || !isPlanning) return;
      e.preventDefault();
      const cell = pixelToCell(e.clientX, e.clientY, responsiveCellSize, getGridOffset());
      if (!cell) return;
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
          setMyPath([...current, cell]);
        }
      } else if (dragState.current.fromPiece) {
        addToPath(cell);
      }
    },
    [addToPath, isPlanning, myPath, myPos, removeFromPath, responsiveCellSize, setMyPath, state.pathPoints],
  );

  const handlePointerEnd = useCallback((e?: React.PointerEvent<HTMLDivElement>) => {
    if (e?.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragState.current = { active: false, fromPiece: false, fromEnd: false };
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!isPlanning) return;
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
        setMyPath([...myPath, next]);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isPlanning, myPath, myPos, obstacles, removeFromPath, setMyPath, state.pathPoints]);

  useEffect(() => {
    pendingPathRef.current = myPath;
    if (!isPlanning || state.players[myColor].pathSubmitted) return;
    const elapsed = Date.now() - lastPathUpdateAtRef.current;
    if (elapsed >= PATH_UPDATE_THROTTLE_MS) {
      emitPathUpdate(myPath);
      return;
    }
    if (pendingPathUpdateRef.current !== null) {
      window.clearTimeout(pendingPathUpdateRef.current);
    }
    pendingPathUpdateRef.current = window.setTimeout(() => {
      pendingPathUpdateRef.current = null;
      emitPathUpdate(pendingPathRef.current);
    }, PATH_UPDATE_THROTTLE_MS - elapsed);
  }, [emitPathUpdate, isPlanning, myColor, myPath, state.players]);

  useEffect(() => {
    return () => {
      if (pendingPathUpdateRef.current !== null) {
        window.clearTimeout(pendingPathUpdateRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isPlanning || !roundInfo || state.players[myColor].pathSubmitted) return;
    const submitAtMs = roundInfo.serverTime + roundInfo.timeLimit * 1000;
    const preSubmitDelayMs = Math.max(0, submitAtMs - Date.now() - PRE_SUBMIT_LEAD_MS);
    const finalSubmitDelayMs = Math.max(0, submitAtMs - Date.now());

    const submitCurrentPath = () => {
      if (state.phase !== 'planning' || state.players[myColor].pathSubmitted) return;
      flushPendingPathUpdate();
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
  }, [flushPendingPathUpdate, isPlanning, myColor, myPath, roundInfo, setMySubmitted, state]);

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
        style={{ width: boardSize, height: boardSize }}
      >
        {cells.map(({ row, col }) => (
          <div
            key={`${row}-${col}`}
            className={`grid-cell ${isBlockedCell({ row, col }, obstacles) ? "obstacle" : ""}`}
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

        {state.players.red.hp > 0 && (
          <PlayerPiece
            color="red"
            position={redDisplayPos}
            cellSize={responsiveCellSize}
            isAttacker={false}
            isHit={hitPlayers.red}
            isExploding={false}
            isMe={myColor === 'red'}
            skin={state.players.red.pieceSkin}
          />
        )}
        {state.players.blue.hp > 0 && (
          <PlayerPiece
            color="blue"
            position={blueDisplayPos}
            cellSize={responsiveCellSize}
            isAttacker={false}
            isHit={hitPlayers.blue}
            isExploding={false}
            isMe={myColor === 'blue'}
            skin={state.players.blue.pieceSkin}
          />
        )}
      </div>
    </div>
  );
}
