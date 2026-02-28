import { useRef, useCallback, useEffect, useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import type { Position } from '../../types/game.types';
import { isBlockedCell, isValidMove, posEqual, pixelToCell } from '../../utils/pathUtils';
import { PlayerPiece } from './PlayerPiece';
import { PathLine } from './PathLine';
import { CollisionEffect } from '../Effects/CollisionEffect';
import { getSocket } from '../../socket/socketClient';
import './GameGrid.css';

const DEFAULT_CELL_SIZE = 96;
const GRID_SIZE = 5;

interface GridProps {
  cellSize?: number;
}

export function GameGrid({ cellSize = DEFAULT_CELL_SIZE }: GridProps) {
  const {
    gameState, myColor, myPath, roundInfo, setMyPath,
    redDisplayPos, blueDisplayPos,
    hitEffect, explosionEffect, collisionEffects,
  } = useGameStore();

  const shellRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [boardSize, setBoardSize] = useState(cellSize * GRID_SIZE);
  const dragState = useRef<{
    active: boolean;
    fromPiece: boolean;
    fromEnd: boolean;
  }>({ active: false, fromPiece: false, fromEnd: false });

  const isPlanning = gameState?.phase === 'planning';
  const myPos = myColor ? gameState?.players[myColor]?.position : null;
  const pathPoints = gameState?.pathPoints ?? 5;
  const obstacles = gameState?.obstacles ?? roundInfo?.obstacles ?? [];

  const getGridOffset = () => {
    const rect = gridRef.current?.getBoundingClientRect();
    return rect ? { x: rect.left, y: rect.top } : { x: 0, y: 0 };
  };

  useEffect(() => {
    const element = shellRef.current;
    if (!element) return;

    const updateSize = (width: number) => {
      if (!width) return;
      setBoardSize(width);
    };

    updateSize(element.getBoundingClientRect().width);

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      updateSize(entry.contentRect.width);
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const responsiveCellSize = boardSize / GRID_SIZE;

  const addToPath = useCallback((cell: Position) => {
    if (!isPlanning || !myPos) return;
    const current = useGameStore.getState().myPath;
    if (current.length >= pathPoints) return;
    if (isBlockedCell(cell, obstacles)) return;
    const lastPos = current.length > 0 ? current[current.length - 1] : myPos;
    if (isValidMove(lastPos, cell)) {
      setMyPath([...current, cell]);
    }
  }, [isPlanning, myPos, obstacles, pathPoints, setMyPath]);

  const removeFromPath = useCallback(() => {
    const current = useGameStore.getState().myPath;
    if (current.length > 0) {
      setMyPath(current.slice(0, -1));
    }
  }, [setMyPath]);

  // Pointer handlers cover mouse and touch input with one path.
  const handlePointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPlanning || !myPos || !gridRef.current) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const cell = pixelToCell(e.clientX, e.clientY, responsiveCellSize, getGridOffset());
    if (!cell) return;

    const current = useGameStore.getState().myPath;
    const isOnPiece = posEqual(cell, myPos) && current.length === 0;
    const isOnEnd = current.length > 0 && posEqual(cell, current[current.length - 1]);
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
  }, [isPlanning, myPos, responsiveCellSize]);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current.active || !isPlanning || !myPos) return;
    e.preventDefault();
    const cell = pixelToCell(e.clientX, e.clientY, responsiveCellSize, getGridOffset());
    if (!cell) return;

    const current = useGameStore.getState().myPath;
    if (current.length > 0) {
      const secondLast = current.length >= 2
        ? current[current.length - 2]
        : myPos;
      if (posEqual(cell, secondLast)) {
        dragState.current = { active: true, fromPiece: false, fromEnd: true };
        removeFromPath();
        return;
      }
    }

    if (dragState.current.fromEnd) {
      // New direction from the current endpoint.
      const lastPos = current.length > 0 ? current[current.length - 1] : myPos;
      if (
        !posEqual(cell, lastPos)
        && !isBlockedCell(cell, obstacles)
        && isValidMove(lastPos, cell)
        && current.length < pathPoints
      ) {
        setMyPath([...current, cell]);
      }
    } else if (dragState.current.fromPiece) {
      // Add mode
      addToPath(cell);
    }
  }, [isPlanning, myPos, responsiveCellSize, addToPath, removeFromPath, obstacles, pathPoints, setMyPath]);

  const handlePointerEnd = useCallback((e?: React.PointerEvent<HTMLDivElement>) => {
    if (e?.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragState.current = { active: false, fromPiece: false, fromEnd: false };
  }, []);

  // Keyboard handler
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!isPlanning || !myPos) return;
      // Don't handle if chat is focused
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;

      const dirs: Record<string, Position> = {
        ArrowUp:    { row: -1, col: 0 },
        ArrowDown:  { row: 1, col: 0 },
        ArrowLeft:  { row: 0, col: -1 },
        ArrowRight: { row: 0, col: 1 },
      };
      const dir = dirs[e.key];
      if (!dir) return;
      e.preventDefault();

      const current = useGameStore.getState().myPath;
      const lastPos = current.length > 0 ? current[current.length - 1] : myPos;
      const next: Position = { row: lastPos.row + dir.row, col: lastPos.col + dir.col };
      if (next.row < 0 || next.row > 4 || next.col < 0 || next.col > 4) return;
      if (isBlockedCell(next, obstacles)) return;

      if (current.length > 0) {
        const secondLast = current.length >= 2
          ? current[current.length - 2]
          : myPos;
        if (posEqual(next, secondLast)) {
          removeFromPath();
          return;
        }
      }

      if (current.length >= pathPoints) return;
      if (isValidMove(lastPos, next)) {
        setMyPath([...current, next]);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isPlanning, myPos, obstacles, pathPoints, removeFromPath, setMyPath]);

  // Submit once when the planning timer ends, even if the path is partial.
  useEffect(() => {
    if (!isPlanning || !myColor || !roundInfo || !gameState) return;
    if (gameState.players[myColor].pathSubmitted) return;

    const submitAtMs = roundInfo.serverTime + roundInfo.timeLimit * 1000;
    const delayMs = Math.max(0, submitAtMs - Date.now());

    const timeoutId = window.setTimeout(() => {
      const state = useGameStore.getState();
      const latestGameState = state.gameState;
      if (!latestGameState || latestGameState.phase !== 'planning') return;
      if (latestGameState.players[myColor].pathSubmitted) return;

      getSocket().emit('submit_path', { path: state.myPath });
      useGameStore.setState({
        gameState: {
          ...latestGameState,
          players: {
            ...latestGameState.players,
            [myColor]: { ...latestGameState.players[myColor], pathSubmitted: true },
          },
        },
      });
    }, delayMs);

    return () => window.clearTimeout(timeoutId);
  }, [isPlanning, myColor, roundInfo, gameState]);

  const cells = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => ({
    row: Math.floor(i / GRID_SIZE),
    col: i % GRID_SIZE,
  }));

  const opponentColor = myColor === 'red' ? 'blue' : 'red';
  const opponentPath: Position[] = []; // opponent path hidden during planning
  const revealedRedPath = gameState?.phase === 'moving'
    ? (useGameStore.getState().animation?.redPath ?? [])
    : (myColor === 'red' ? myPath : []);
  const revealedBluePath = gameState?.phase === 'moving'
    ? (useGameStore.getState().animation?.bluePath ?? [])
    : (myColor === 'blue' ? myPath : []);

  void opponentColor; void opponentPath;

  return (
    <div ref={shellRef} className="game-grid-shell">
      <div
        ref={gridRef}
        className="game-grid"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        style={{ width: boardSize, height: boardSize }}
      >
      {cells.map(({ row, col }) => (
        <div
          key={`${row}-${col}`}
          className={`grid-cell ${isBlockedCell({ row, col }, obstacles) ? 'obstacle' : ''}`}
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

      {/* Path lines: red behind (lower z-index, thicker), blue on top */}
      <PathLine color="red" path={revealedRedPath} startPos={gameState?.players.red.position ?? redDisplayPos} cellSize={responsiveCellSize} isPlanning={isPlanning} />
      <PathLine color="blue" path={revealedBluePath} startPos={gameState?.players.blue.position ?? blueDisplayPos} cellSize={responsiveCellSize} isPlanning={isPlanning} />

      {/* Collision effects */}
      {collisionEffects.map(({ id, position }) => (
        <CollisionEffect key={id} position={position} cellSize={responsiveCellSize} />
      ))}

      {/* Pieces */}
      <PlayerPiece
        color="red"
        position={redDisplayPos}
        cellSize={responsiveCellSize}
        isAttacker={gameState?.attackerColor === 'red'}
        isHit={hitEffect.red}
        isExploding={explosionEffect === 'red'}
        isMe={myColor === 'red'}
      />
      <PlayerPiece
        color="blue"
        position={blueDisplayPos}
        cellSize={responsiveCellSize}
        isAttacker={gameState?.attackerColor === 'blue'}
        isHit={hitEffect.blue}
        isExploding={explosionEffect === 'blue'}
        isMe={myColor === 'blue'}
      />
      </div>
    </div>
  );
}
