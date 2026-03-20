import { useRef, useCallback } from 'react';
import type { PlayerColor, Position } from '../../types/game.types';
import type { AbilityBattleState } from '../../types/ability.types';
import { pixelToCell, isBlockedCell, isValidMove, posEqual } from '../../utils/pathUtils';
import { PlayerPiece } from '../Game/PlayerPiece';
import { PathLine } from '../Game/PathLine';
import { CollisionEffect } from '../Effects/CollisionEffect';

interface Props {
  state: AbilityBattleState;
  currentColor: PlayerColor;
  myPath: Position[];
  opponentPath: Position[];
  setMyPath: (path: Position[]) => void;
  displayPositions: { red: Position; blue: Position };
  hitFlags: { red: boolean; blue: boolean };
  explodingFlags: { red: boolean; blue: boolean };
  collisionEffects: Array<{ id: number; position: Position }>;
  activeGuards: { red: boolean; blue: boolean };
  previewStart: Position;
  movingPaths: { red: Position[]; blue: Position[] };
  cellSize: number;
  isPlanning: boolean;
  teleportTargetsVisible: boolean;
  onTeleportTargetSelect: (target: Position) => void;
}

const GRID_SIZE = 5;

export function AbilityGrid({
  state,
  currentColor,
  myPath,
  opponentPath,
  setMyPath,
  displayPositions,
  hitFlags,
  explodingFlags,
  collisionEffects,
  activeGuards,
  previewStart,
  movingPaths,
  cellSize,
  isPlanning,
  teleportTargetsVisible,
  onTeleportTargetSelect,
}: Props) {
  const gridRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ active: boolean; fromStart: boolean; fromEnd: boolean }>({
    active: false,
    fromStart: false,
    fromEnd: false,
  });

  const getGridOffset = () => {
    const rect = gridRef.current?.getBoundingClientRect();
    return rect ? { x: rect.left, y: rect.top } : { x: 0, y: 0 };
  };

  const myStart = previewStart;
  const obstacles = state.obstacles;
  const pathPoints = state.pathPoints;
  const redSkin = state.players.red.pieceSkin;
  const blueSkin = state.players.blue.pieceSkin;

  const removeFromPath = useCallback(() => {
    if (myPath.length > 0) {
      setMyPath(myPath.slice(0, -1));
    }
  }, [myPath, setMyPath]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isPlanning || teleportTargetsVisible || !gridRef.current) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const cell = pixelToCell(e.clientX, e.clientY, cellSize, getGridOffset());
      if (!cell) return;
      const isOnStart = posEqual(cell, myStart);
      const isOnEnd = myPath.length > 0 && posEqual(cell, myPath[myPath.length - 1]);
      if (!isOnStart && !isOnEnd) return;
      dragState.current = {
        active: true,
        fromStart: isOnStart,
        fromEnd: isOnEnd,
      };
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [isPlanning, teleportTargetsVisible, cellSize, myPath, myStart],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragState.current.active || !isPlanning || teleportTargetsVisible) return;
      const cell = pixelToCell(e.clientX, e.clientY, cellSize, getGridOffset());
      if (!cell) return;
      const current = myPath;

      if (current.length > 0) {
        const secondLast = current.length >= 2 ? current[current.length - 2] : myStart;
        if (posEqual(cell, secondLast)) {
          dragState.current = { active: true, fromStart: false, fromEnd: true };
          removeFromPath();
          return;
        }
      }

      if (dragState.current.fromStart || dragState.current.fromEnd) {
        const lastPos = current.length > 0 ? current[current.length - 1] : myStart;
        if (!posEqual(cell, lastPos) && !isBlockedCell(cell, obstacles) && isValidMove(lastPos, cell) && current.length < pathPoints) {
          setMyPath([...current, cell]);
        }
      }
    },
    [isPlanning, teleportTargetsVisible, cellSize, myPath, myStart, obstacles, pathPoints, removeFromPath, setMyPath],
  );

  const handlePointerEnd = useCallback((e?: React.PointerEvent<HTMLDivElement>) => {
    if (e?.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragState.current = { active: false, fromStart: false, fromEnd: false };
  }, []);

  const cells = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => ({
    row: Math.floor(index / GRID_SIZE),
    col: index % GRID_SIZE,
  }));

  const redPath = state.phase === 'moving' ? movingPaths.red : currentColor === 'red' ? myPath : opponentPath;
  const bluePath = state.phase === 'moving' ? movingPaths.blue : currentColor === 'blue' ? myPath : opponentPath;

  const teleportTargets = teleportTargetsVisible
    ? Array.from({ length: 9 }, (_, index) => ({
        row: state.players[currentColor].position.row + Math.floor(index / 3) - 1,
        col: state.players[currentColor].position.col + (index % 3) - 1,
      })).filter(
        (position) =>
          !(position.row === state.players[currentColor].position.row && position.col === state.players[currentColor].position.col) &&
          position.row >= 0 &&
          position.row < GRID_SIZE &&
          position.col >= 0 &&
          position.col < GRID_SIZE &&
          !isBlockedCell(position, obstacles),
      )
    : [];

  return (
    <div className="game-grid-shell">
      <div
        ref={gridRef}
        className="game-grid ability-grid"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        style={{ width: cellSize * GRID_SIZE, height: cellSize * GRID_SIZE }}
      >
        {cells.map(({ row, col }) => (
          <div
            key={`${row}-${col}`}
            className={`grid-cell ${isBlockedCell({ row, col }, obstacles) ? 'obstacle' : ''}`}
            style={{
              left: col * cellSize,
              top: row * cellSize,
              width: cellSize,
              height: cellSize,
              ['--cell-size' as string]: `${cellSize}px`,
            }}
          >
            {isBlockedCell({ row, col }, obstacles) && <div className="obstacle-mark" />}
          </div>
        ))}

        {teleportTargets.map((target) => (
          <button
            key={`tele-${target.row}-${target.col}`}
            type="button"
            className="ability-teleport-target"
            style={{
              left: target.col * cellSize + cellSize / 2,
              top: target.row * cellSize + cellSize / 2,
              width: Math.max(20, cellSize * 0.34),
              height: Math.max(20, cellSize * 0.34),
              transform: 'translate(-50%, -50%)',
            }}
            onClick={() => onTeleportTargetSelect(target)}
          />
        ))}

        <PathLine color="red" path={redPath} startPos={state.players.red.position} cellSize={cellSize} isPlanning={state.phase !== 'moving'} />
        <PathLine color="blue" path={bluePath} startPos={state.players.blue.position} cellSize={cellSize} isPlanning={state.phase !== 'moving'} />

        {collisionEffects.map(({ id, position }) => (
          <CollisionEffect key={id} position={position} cellSize={cellSize} />
        ))}

        {activeGuards.red && (
          <div
            className="ability-guard-ring"
            style={{
              left: displayPositions.red.col * cellSize + cellSize / 2,
              top: displayPositions.red.row * cellSize + cellSize / 2,
              width: Math.max(42, cellSize * 0.82),
              height: Math.max(42, cellSize * 0.82),
              transform: 'translate(-50%, -50%)',
            }}
          />
        )}
        {activeGuards.blue && (
          <div
            className="ability-guard-ring"
            style={{
              left: displayPositions.blue.col * cellSize + cellSize / 2,
              top: displayPositions.blue.row * cellSize + cellSize / 2,
              width: Math.max(42, cellSize * 0.82),
              height: Math.max(42, cellSize * 0.82),
              transform: 'translate(-50%, -50%)',
            }}
          />
        )}

        {state.players.red.hp > 0 || hitFlags.red || explodingFlags.red ? (
          <PlayerPiece
            color="red"
            position={displayPositions.red}
            cellSize={cellSize}
            isAttacker={state.attackerColor === 'red'}
            isHit={hitFlags.red}
            isExploding={explodingFlags.red}
            isMe={currentColor === 'red'}
            skin={redSkin}
          />
        ) : null}
        {state.players.blue.hp > 0 || hitFlags.blue || explodingFlags.blue ? (
          <PlayerPiece
            color="blue"
            position={displayPositions.blue}
            cellSize={cellSize}
            isAttacker={state.attackerColor === 'blue'}
            isHit={hitFlags.blue}
            isExploding={explodingFlags.blue}
            isMe={currentColor === 'blue'}
            skin={blueSkin}
          />
        ) : null}
      </div>
    </div>
  );
}
