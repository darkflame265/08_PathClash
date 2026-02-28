import { useRef, useCallback, useEffect } from 'react';
import { useGameStore } from '../../store/gameStore';
import type { Position } from '../../types/game.types';
import { isValidMove, posEqual, pixelToCell } from '../../utils/pathUtils';
import { PlayerPiece } from './PlayerPiece';
import { PathLine } from './PathLine';
import { CollisionEffect } from '../Effects/CollisionEffect';
import { getSocket } from '../../socket/socketClient';
import './GameGrid.css';

const CELL_SIZE = 96;
const GRID_SIZE = 5;

export function GameGrid() {
  const {
    gameState, myColor, myPath, roundInfo, setMyPath,
    redDisplayPos, blueDisplayPos,
    hitEffect, explosionEffect, collisionEffects,
  } = useGameStore();

  const gridRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{
    active: boolean;
    fromPiece: boolean;
    fromEnd: boolean;
  }>({ active: false, fromPiece: false, fromEnd: false });

  const isPlanning = gameState?.phase === 'planning';
  const myPos = myColor ? gameState?.players[myColor]?.position : null;
  const pathPoints = gameState?.pathPoints ?? 5;

  const getGridOffset = () => {
    const rect = gridRef.current?.getBoundingClientRect();
    return rect ? { x: rect.left, y: rect.top } : { x: 0, y: 0 };
  };

  const addToPath = useCallback((cell: Position) => {
    if (!isPlanning || !myPos) return;
    const current = useGameStore.getState().myPath;
    if (current.length >= pathPoints) return;
    const lastPos = current.length > 0 ? current[current.length - 1] : myPos;
    if (isValidMove(lastPos, cell)) {
      setMyPath([...current, cell]);
    }
  }, [isPlanning, myPos, pathPoints, setMyPath]);

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!isPlanning || !myPos || !gridRef.current) return;
    const cell = pixelToCell(e.clientX, e.clientY, CELL_SIZE, getGridOffset());
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
  }, [isPlanning, myPos]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!dragState.current.active || !isPlanning || !myPos) return;
    const cell = pixelToCell(e.clientX, e.clientY, CELL_SIZE, getGridOffset());
    if (!cell) return;

    const current = useGameStore.getState().myPath;

    if (dragState.current.fromEnd) {
      // Continue from the current path end, including immediate backtracking.
      const lastPos = current.length > 0 ? current[current.length - 1] : myPos;
      if (!posEqual(cell, lastPos) && isValidMove(lastPos, cell) && current.length < pathPoints) {
        setMyPath([...current, cell]);
      }
    } else if (dragState.current.fromPiece) {
      // Add mode
      addToPath(cell);
    }
  }, [isPlanning, myPos, addToPath, pathPoints, setMyPath]);

  const handleMouseUp = useCallback(() => {
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
      if (current.length >= pathPoints) return;
      const lastPos = current.length > 0 ? current[current.length - 1] : myPos;
      const next: Position = { row: lastPos.row + dir.row, col: lastPos.col + dir.col };
      if (next.row >= 0 && next.row <= 4 && next.col >= 0 && next.col <= 4) {
        setMyPath([...current, next]);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isPlanning, myPos, pathPoints, setMyPath]);

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
    <div
      ref={gridRef}
      className="game-grid"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{ width: CELL_SIZE * GRID_SIZE, height: CELL_SIZE * GRID_SIZE }}
    >
      {cells.map(({ row, col }) => (
        <div
          key={`${row}-${col}`}
          className="grid-cell"
          style={{
            left: col * CELL_SIZE,
            top: row * CELL_SIZE,
            width: CELL_SIZE,
            height: CELL_SIZE,
          }}
        />
      ))}

      {/* Path lines: red behind (lower z-index, thicker), blue on top */}
      <PathLine color="red" path={revealedRedPath} startPos={gameState?.players.red.position ?? redDisplayPos} cellSize={CELL_SIZE} isPlanning={isPlanning} />
      <PathLine color="blue" path={revealedBluePath} startPos={gameState?.players.blue.position ?? blueDisplayPos} cellSize={CELL_SIZE} isPlanning={isPlanning} />

      {/* Collision effects */}
      {collisionEffects.map(({ id, position }) => (
        <CollisionEffect key={id} position={position} cellSize={CELL_SIZE} />
      ))}

      {/* Pieces */}
      <PlayerPiece
        color="red"
        position={redDisplayPos}
        cellSize={CELL_SIZE}
        isAttacker={gameState?.attackerColor === 'red'}
        isHit={hitEffect.red}
        isExploding={explosionEffect === 'red'}
      />
      <PlayerPiece
        color="blue"
        position={blueDisplayPos}
        cellSize={CELL_SIZE}
        isAttacker={gameState?.attackerColor === 'blue'}
        isHit={hitEffect.blue}
        isExploding={explosionEffect === 'blue'}
      />
    </div>
  );
}
