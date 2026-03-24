import { useRef, useCallback, useEffect, useState } from 'react';
import type { PlayerColor, Position } from '../../types/game.types';
import type { AbilityBattleState, AbilitySkillReservation } from '../../types/ability.types';
import { pixelToCell, isBlockedCell, isValidMove, posEqual } from '../../utils/pathUtils';
import { PlayerPiece } from '../Game/PlayerPiece';
import { PathLine } from '../Game/PathLine';
import { CollisionEffect } from '../Effects/CollisionEffect';

interface Props {
  state: AbilityBattleState;
  currentColor: PlayerColor;
  myPath: Position[];
  setMyPath: (path: Position[]) => void;
  displayPositions: { red: Position; blue: Position };
  hitFlags: { red: boolean; blue: boolean };
  explodingFlags: { red: boolean; blue: boolean };
  collisionEffects: Array<{ id: number; position: Position }>;
  teleportEffects: Array<{
    id: number;
    color: PlayerColor;
    from: Position;
    to: Position;
  }>;
  activeGuards: { red: boolean; blue: boolean };
  previewStart: Position;
  teleportReservation: AbilitySkillReservation | null;
  teleportMarker: Position | null;
  movingTeleportMarkers: { red: Position | null; blue: Position | null };
  movingTeleportSteps: { red: number | null; blue: number | null };
  movingBlitzColors: { red: boolean; blue: boolean };
  movingPaths: { red: Position[]; blue: Position[] };
  movingStarts: { red: Position; blue: Position } | null;
  cellSize: number;
  isPlanning: boolean;
  teleportTargetsVisible: boolean;
  blitzTargetsVisible: boolean;
  onTeleportTargetSelect: (target: Position) => void;
  onBlitzTargetSelect: (target: Position) => void;
  onTeleportCancel: () => void;
}

const GRID_SIZE = 5;
const DEFAULT_CELL_SIZE = 96;

export function AbilityGrid({
  state,
  currentColor,
  myPath,
  setMyPath,
  displayPositions,
  hitFlags,
  explodingFlags,
  collisionEffects,
  teleportEffects,
  activeGuards,
  previewStart,
  teleportReservation,
  teleportMarker,
  movingTeleportMarkers,
  movingTeleportSteps,
  movingBlitzColors,
  movingPaths,
  movingStarts,
  cellSize,
  isPlanning,
  teleportTargetsVisible,
  blitzTargetsVisible,
  onTeleportTargetSelect,
  onBlitzTargetSelect,
  onTeleportCancel,
}: Props) {
  const shellRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [boardSize, setBoardSize] = useState(cellSize * GRID_SIZE || DEFAULT_CELL_SIZE * GRID_SIZE);
  const dragState = useRef<{ active: boolean; fromStart: boolean; fromEnd: boolean }>({
    active: false,
    fromStart: false,
    fromEnd: false,
  });


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

  const teleportStep =
    teleportReservation?.skillId === 'quantum_shift' ? teleportReservation.step : null;
  const teleportTarget =
    teleportReservation?.skillId === 'quantum_shift' ? teleportReservation.target ?? null : null;
  const baseStart = state.players[currentColor].position;
  const myStart = previewStart;
  const obstacles = state.obstacles;
  const pathPoints = state.pathPoints;
  const redSkin = state.players.red.pieceSkin;
  const blueSkin = state.players.blue.pieceSkin;

  const getPlanningTailPosition = useCallback(
    (path: Position[]) => {
      if (
        teleportTarget &&
        teleportStep !== null &&
        path.length === teleportStep
      ) {
        return teleportTarget;
      }
      return path.length > 0 ? path[path.length - 1] : myStart;
    },
    [myStart, teleportStep, teleportTarget],
  );

  const getPlanningSecondLastPosition = useCallback(
    (path: Position[]) => {
      if (path.length < 2) return myStart;
      if (teleportTarget && teleportStep !== null && path.length - 1 === teleportStep) {
        return teleportTarget;
      }
      return path[path.length - 2];
    },
    [myStart, teleportStep, teleportTarget],
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
      if (teleportTargetsVisible || blitzTargetsVisible) {
        const currentPos = state.players[currentColor].position;
        if (!posEqual(cell, currentPos)) return;
        if (teleportTargetsVisible) onTeleportCancel();
        if (blitzTargetsVisible) return;
        dragState.current = {
          active: true,
          fromStart: true,
          fromEnd: false,
        };
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
      const logicalEnd = getPlanningTailPosition(myPath);
      const isOnStart = posEqual(cell, myStart);
      const isOnEnd = posEqual(cell, logicalEnd);
      if (!isOnStart && !isOnEnd) return;
      dragState.current = {
        active: true,
        fromStart: isOnStart,
        fromEnd: isOnEnd,
      };
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [blitzTargetsVisible, currentColor, getPlanningTailPosition, isPlanning, myPath, myStart, onTeleportCancel, responsiveCellSize, state.players, teleportTargetsVisible],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragState.current.active || !isPlanning) return;
      const cell = pixelToCell(e.clientX, e.clientY, responsiveCellSize, getGridOffset());
      if (!cell) return;
      const current = myPath;

      if (current.length > 0) {
        const secondLast = getPlanningSecondLastPosition(current);
        if (posEqual(cell, secondLast)) {
          dragState.current = { active: true, fromStart: false, fromEnd: true };
          removeFromPath();
          return;
        }
      }

      if (dragState.current.fromStart || dragState.current.fromEnd) {
        const lastPos = getPlanningTailPosition(current);
        if (!posEqual(cell, lastPos) && !isBlockedCell(cell, obstacles) && isValidMove(lastPos, cell) && current.length < pathPoints) {
          setMyPath([...current, cell]);
        }
      }
    },
    [getPlanningSecondLastPosition, getPlanningTailPosition, isPlanning, myPath, obstacles, pathPoints, removeFromPath, responsiveCellSize, setMyPath],
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

  const redPath =
    state.phase === 'moving'
      ? movingPaths.red
      : currentColor === 'red'
        ? myPath
        : [];
  const bluePath =
    state.phase === 'moving'
      ? movingPaths.blue
      : currentColor === 'blue'
        ? myPath
        : [];

  const teleportOrigin =
    myPath.length > 0 ? myPath[myPath.length - 1] : state.players[currentColor].position;

  const teleportTargets = teleportTargetsVisible
    ? Array.from({ length: 9 }, (_, index) => ({
        row: teleportOrigin.row + Math.floor(index / 3) - 1,
        col: teleportOrigin.col + (index % 3) - 1,
      })).filter(
        (position) =>
          !(position.row === teleportOrigin.row && position.col === teleportOrigin.col) &&
          position.row >= 0 &&
          position.row < GRID_SIZE &&
          position.col >= 0 &&
          position.col < GRID_SIZE &&
          !isBlockedCell(position, obstacles),
      )
    : [];

  const blitzTargets = blitzTargetsVisible
    ? [
        { row: state.players[currentColor].position.row - 1, col: state.players[currentColor].position.col, icon: '↑' },
        { row: state.players[currentColor].position.row + 1, col: state.players[currentColor].position.col, icon: '↓' },
        { row: state.players[currentColor].position.row, col: state.players[currentColor].position.col - 1, icon: '←' },
        { row: state.players[currentColor].position.row, col: state.players[currentColor].position.col + 1, icon: '→' },
      ].filter(
        (position) =>
          position.row >= 0 &&
          position.row < GRID_SIZE &&
          position.col >= 0 &&
          position.col < GRID_SIZE,
      )
    : [];

  return (
    <div ref={shellRef} className="game-grid-shell">
      <div
        ref={gridRef}
        className="game-grid ability-grid"
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

        {teleportTargets.map((target) => (
          <button
            key={`tele-${target.row}-${target.col}`}
            type="button"
            className="ability-teleport-target"
            style={{
              left: target.col * responsiveCellSize + responsiveCellSize / 2,
              top: target.row * responsiveCellSize + responsiveCellSize / 2,
              width: Math.max(20, responsiveCellSize * 0.34),
              height: Math.max(20, responsiveCellSize * 0.34),
              transform: 'translate(-50%, -50%)',
            }}
            onClick={() => onTeleportTargetSelect(target)}
          />
        ))}

        {blitzTargets.map((target) => (
          <button
            key={`blitz-${target.row}-${target.col}`}
            type="button"
            className="ability-blitz-target"
            style={{
              left: target.col * responsiveCellSize + responsiveCellSize / 2,
              top: target.row * responsiveCellSize + responsiveCellSize / 2,
              width: Math.max(24, responsiveCellSize * 0.38),
              height: Math.max(24, responsiveCellSize * 0.38),
              transform: 'translate(-50%, -50%)',
            }}
            onClick={() => onBlitzTargetSelect(target)}
          >
            {target.icon}
          </button>
        ))}

        {state.phase === 'moving' ? (
          movingTeleportMarkers.red && movingTeleportSteps.red !== null ? (
            <>
              <PathLine
                color="red"
                path={redPath.slice(0, movingTeleportSteps.red)}
                startPos={state.players.red.position}
                cellSize={responsiveCellSize}
                isPlanning={false}
              />
              <PathLine
                color="red"
                path={redPath.slice(movingTeleportSteps.red)}
                startPos={movingTeleportMarkers.red}
                cellSize={responsiveCellSize}
                isPlanning={false}
              />
            </>
          ) : (
            <PathLine
              color="red"
              path={redPath}
              startPos={movingStarts?.red ?? state.players.red.position}
              cellSize={responsiveCellSize}
              isPlanning={false}
            />
          )
        ) : currentColor !== 'red' || !teleportTarget || teleportStep === null ? (
          <PathLine
            color="red"
            path={redPath}
            startPos={currentColor === 'red' ? myStart : state.players.red.position}
            cellSize={responsiveCellSize}
            isPlanning
          />
        ) : (
          <>
            <PathLine
              color="red"
              path={redPath.slice(0, teleportStep)}
              startPos={baseStart}
              cellSize={responsiveCellSize}
              isPlanning
            />
            <PathLine
              color="red"
              path={redPath.slice(teleportStep)}
              startPos={teleportTarget}
              cellSize={responsiveCellSize}
              isPlanning
            />
          </>
        )}
        {movingBlitzColors.red && movingPaths.red.length > 0 && (
          <svg className="ability-blitz-line" width="100%" height="100%">
            <polyline
              points={[movingStarts?.red ?? state.players.red.position, ...movingPaths.red]
                .map((p) => `${p.col * responsiveCellSize + responsiveCellSize / 2},${p.row * responsiveCellSize + responsiveCellSize / 2}`)
                .join(' ')}
              fill="none"
              stroke="#d946ef"
              strokeWidth={Math.max(4, responsiveCellSize * 0.09)}
              strokeOpacity={0.88}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={`${Math.max(6, responsiveCellSize * 0.22)} ${Math.max(4, responsiveCellSize * 0.14)}`}
              style={{ filter: 'drop-shadow(0 0 8px rgba(217, 70, 239, 0.55))' }}
            />
          </svg>
        )}
        {state.phase === 'moving' ? (
          movingTeleportMarkers.blue && movingTeleportSteps.blue !== null ? (
            <>
              <PathLine
                color="blue"
                path={bluePath.slice(0, movingTeleportSteps.blue)}
                startPos={state.players.blue.position}
                cellSize={responsiveCellSize}
                isPlanning={false}
              />
              <PathLine
                color="blue"
                path={bluePath.slice(movingTeleportSteps.blue)}
                startPos={movingTeleportMarkers.blue}
                cellSize={responsiveCellSize}
                isPlanning={false}
              />
            </>
          ) : (
            <PathLine
              color="blue"
              path={bluePath}
              startPos={movingStarts?.blue ?? state.players.blue.position}
              cellSize={responsiveCellSize}
              isPlanning={false}
            />
          )
        ) : currentColor !== 'blue' || !teleportTarget || teleportStep === null ? (
          <PathLine
            color="blue"
            path={bluePath}
            startPos={currentColor === 'blue' ? myStart : state.players.blue.position}
            cellSize={responsiveCellSize}
            isPlanning
          />
        ) : (
          <>
            <PathLine
              color="blue"
              path={bluePath.slice(0, teleportStep)}
              startPos={baseStart}
              cellSize={responsiveCellSize}
              isPlanning
            />
            <PathLine
              color="blue"
              path={bluePath.slice(teleportStep)}
              startPos={teleportTarget}
              cellSize={responsiveCellSize}
              isPlanning
            />
          </>
        )}
        {movingBlitzColors.blue && movingPaths.blue.length > 0 && (
          <svg className="ability-blitz-line" width="100%" height="100%">
            <polyline
              points={[movingStarts?.blue ?? state.players.blue.position, ...movingPaths.blue]
                .map((p) => `${p.col * responsiveCellSize + responsiveCellSize / 2},${p.row * responsiveCellSize + responsiveCellSize / 2}`)
                .join(' ')}
              fill="none"
              stroke="#d946ef"
              strokeWidth={Math.max(4, responsiveCellSize * 0.09)}
              strokeOpacity={0.88}
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeDasharray={`${Math.max(6, responsiveCellSize * 0.22)} ${Math.max(4, responsiveCellSize * 0.14)}`}
              style={{ filter: 'drop-shadow(0 0 8px rgba(217, 70, 239, 0.55))' }}
            />
          </svg>
        )}

        {teleportMarker && state.phase !== 'moving' && (
          <div
            className="ability-teleport-marker"
            style={{
              left: teleportMarker.col * responsiveCellSize + responsiveCellSize / 2,
              top: teleportMarker.row * responsiveCellSize + responsiveCellSize / 2,
              width: Math.max(24, responsiveCellSize * 0.34),
              height: Math.max(24, responsiveCellSize * 0.34),
              transform: 'translate(-50%, -50%)',
            }}
          >
            ✦
          </div>
        )}

        {state.phase === 'moving' &&
          (['red', 'blue'] as const).map((color) => {
            const marker = movingTeleportMarkers[color];
            if (!marker) return null;
            return (
              <div
                key={`moving-teleport-${color}`}
                className="ability-teleport-marker"
                style={{
                  left: marker.col * responsiveCellSize + responsiveCellSize / 2,
                  top: marker.row * responsiveCellSize + responsiveCellSize / 2,
                  width: Math.max(24, responsiveCellSize * 0.34),
                  height: Math.max(24, responsiveCellSize * 0.34),
                  transform: 'translate(-50%, -50%)',
                }}
              >
                ✦
              </div>
            );
          })}

        {collisionEffects.map(({ id, position }) => (
          <CollisionEffect key={id} position={position} cellSize={responsiveCellSize} />
        ))}

        {teleportEffects.map((effect) => (
          <div key={`teleport-${effect.id}`}>
            <div
              className={`ability-teleport-burst ability-teleport-burst-depart ability-teleport-burst-${effect.color}`}
              style={{
                left: effect.from.col * responsiveCellSize + responsiveCellSize / 2,
                top: effect.from.row * responsiveCellSize + responsiveCellSize / 2,
                width: Math.max(34, responsiveCellSize * 0.72),
                height: Math.max(34, responsiveCellSize * 0.72),
                transform: 'translate(-50%, -50%)',
              }}
            >
              <span className="ability-teleport-ring ability-teleport-ring-outer" />
              <span className="ability-teleport-ring ability-teleport-ring-inner" />
              <span className="ability-teleport-particle ability-teleport-particle-a" />
              <span className="ability-teleport-particle ability-teleport-particle-b" />
              <span className="ability-teleport-particle ability-teleport-particle-c" />
              <span className="ability-teleport-particle ability-teleport-particle-d" />
            </div>
            <div
              className={`ability-teleport-burst ability-teleport-burst-arrive ability-teleport-burst-${effect.color}`}
              style={{
                left: effect.to.col * responsiveCellSize + responsiveCellSize / 2,
                top: effect.to.row * responsiveCellSize + responsiveCellSize / 2,
                width: Math.max(38, responsiveCellSize * 0.8),
                height: Math.max(38, responsiveCellSize * 0.8),
                transform: 'translate(-50%, -50%)',
              }}
            >
              <span className="ability-teleport-ring ability-teleport-ring-outer" />
              <span className="ability-teleport-ring ability-teleport-ring-inner" />
              <span className="ability-teleport-particle ability-teleport-particle-a" />
              <span className="ability-teleport-particle ability-teleport-particle-b" />
              <span className="ability-teleport-particle ability-teleport-particle-c" />
              <span className="ability-teleport-particle ability-teleport-particle-d" />
            </div>
          </div>
        ))}

        {activeGuards.red && (
          <div
            className="ability-guard-ring"
            style={{
              left: displayPositions.red.col * responsiveCellSize + responsiveCellSize / 2,
              top: displayPositions.red.row * responsiveCellSize + responsiveCellSize / 2,
              width: Math.max(42, responsiveCellSize * 0.82),
              height: Math.max(42, responsiveCellSize * 0.82),
              transform: 'translate(-50%, -50%)',
            }}
          />
        )}
        {activeGuards.blue && (
          <div
            className="ability-guard-ring"
            style={{
              left: displayPositions.blue.col * responsiveCellSize + responsiveCellSize / 2,
              top: displayPositions.blue.row * responsiveCellSize + responsiveCellSize / 2,
              width: Math.max(42, responsiveCellSize * 0.82),
              height: Math.max(42, responsiveCellSize * 0.82),
              transform: 'translate(-50%, -50%)',
            }}
          />
        )}

        {state.players.red.hp > 0 || hitFlags.red || explodingFlags.red ? (
          <PlayerPiece
            color="red"
            position={displayPositions.red}
            cellSize={responsiveCellSize}
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
            cellSize={responsiveCellSize}
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
