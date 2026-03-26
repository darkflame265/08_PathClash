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
  pathPoints: number;
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
  chargeEffects: Array<{
    id: number;
    color: PlayerColor;
    position: Position;
  }>;
  healEffects: Array<{
    id: number;
    color: PlayerColor;
    position: Position;
  }>;
  activeGuards: { red: boolean; blue: boolean };
  activePhaseShifts: { red: boolean; blue: boolean };
  previewStart: Position;
  teleportReservation: AbilitySkillReservation | null;
  teleportMarker: Position | null;
  infernoMarker: Position | null;
  movingTeleportMarkers: { red: Position | null; blue: Position | null };
  movingTeleportSteps: { red: number | null; blue: number | null };
  movingBlitzColors: { red: boolean; blue: boolean };
  movingBlitzProgress: { red: number; blue: number };
  movingBlitzSteps: { red: number | null; blue: number | null };
  movingPaths: { red: Position[]; blue: Position[] };
  movingStarts: { red: Position; blue: Position } | null;
  cellSize: number;
  isPlanning: boolean;
  canEditPath: boolean;
  teleportTargetsVisible: boolean;
  blitzTargetsVisible: boolean;
  infernoTargetsVisible: boolean;
  onTeleportTargetSelect: (target: Position) => void;
  onBlitzTargetSelect: (target: Position) => void;
  onInfernoTargetSelect: (target: Position) => void;
  onTeleportCancel: () => void;
}

const GRID_SIZE = 5;
const DEFAULT_CELL_SIZE = 96;

function toGridPixel(position: Position, cellSize: number) {
  return {
    x: position.col * cellSize + cellSize / 2,
    y: position.row * cellSize + cellSize / 2,
  };
}

function buildBlitzBoltPoints(
  positions: Position[],
  cellSize: number,
  amplitude: number,
  phase = 0,
) {
  return positions
    .map((position, index, array) => {
      const { x, y } = toGridPixel(position, cellSize);
      if (index === 0 || index === array.length - 1) {
        return `${x},${y}`;
      }
      const prev = array[index - 1];
      const next = array[index + 1];
      const dx = next.col - prev.col;
      const dy = next.row - prev.row;
      const length = Math.hypot(dx, dy) || 1;
      const nx = -dy / length;
      const ny = dx / length;
      const direction = (index + phase) % 2 === 0 ? 1 : -1;
      return `${x + nx * amplitude * direction},${y + ny * amplitude * direction}`;
    })
    .join(' ');
}

export function AbilityGrid({
  state,
  currentColor,
  pathPoints,
  myPath,
  setMyPath,
  displayPositions,
  hitFlags,
  explodingFlags,
  collisionEffects,
  teleportEffects,
  chargeEffects,
  healEffects,
  activeGuards,
  activePhaseShifts,
  previewStart,
  teleportReservation,
  teleportMarker,
  infernoMarker,
  movingTeleportMarkers,
  movingTeleportSteps,
  movingBlitzColors,
  movingBlitzProgress,
  movingBlitzSteps,
  movingPaths,
  movingStarts,
  cellSize,
  isPlanning,
  canEditPath,
  teleportTargetsVisible,
  blitzTargetsVisible,
  infernoTargetsVisible,
  onTeleportTargetSelect,
  onBlitzTargetSelect,
  onInfernoTargetSelect,
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
  const redSkin = state.players.red.pieceSkin;
  const blueSkin = state.players.blue.pieceSkin;
  const redVisible =
    !state.players.red.hidden || currentColor === 'red' || state.phase !== 'planning';
  const blueVisible =
    !state.players.blue.hidden || currentColor === 'blue' || state.phase !== 'planning';

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
      if (!canEditPath || !gridRef.current) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const cell = pixelToCell(e.clientX, e.clientY, responsiveCellSize, getGridOffset());
      if (!cell) return;
      if (teleportTargetsVisible || blitzTargetsVisible || infernoTargetsVisible) {
        const currentPos = state.players[currentColor].position;
        if (!posEqual(cell, currentPos)) return;
        if (teleportTargetsVisible) onTeleportCancel();
        if (blitzTargetsVisible) return;
        if (infernoTargetsVisible) return;
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
    [blitzTargetsVisible, canEditPath, currentColor, getPlanningTailPosition, infernoTargetsVisible, myPath, myStart, onTeleportCancel, responsiveCellSize, state.players, teleportTargetsVisible],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragState.current.active || !canEditPath) return;
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
    [canEditPath, getPlanningSecondLastPosition, getPlanningTailPosition, myPath, obstacles, pathPoints, removeFromPath, responsiveCellSize, setMyPath],
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
    state.phase === 'moving' || state.phase === 'gameover'
      ? movingPaths.red
      : currentColor === 'red'
        ? myPath
        : [];
  const bluePath =
    state.phase === 'moving' || state.phase === 'gameover'
      ? movingPaths.blue
      : currentColor === 'blue'
        ? myPath
        : [];
  const isPlaybackPhase = state.phase === 'moving' || state.phase === 'gameover';

  const teleportOrigin =
    myPath.length > 0 ? myPath[myPath.length - 1] : state.players[currentColor].position;

  const blitzOrigin =
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
        { row: blitzOrigin.row - 1, col: blitzOrigin.col, icon: '↑' },
        { row: blitzOrigin.row + 1, col: blitzOrigin.col, icon: '↓' },
        { row: blitzOrigin.row, col: blitzOrigin.col - 1, icon: '←' },
        { row: blitzOrigin.row, col: blitzOrigin.col + 1, icon: '→' },
      ].filter(
        (position) =>
          position.row >= 0 &&
          position.row < GRID_SIZE &&
          position.col >= 0 &&
          position.col < GRID_SIZE,
      )
    : [];

  const infernoTargets = infernoTargetsVisible
    ? cells.filter(
        (position) =>
          !posEqual(position, state.players.red.position) &&
          !posEqual(position, state.players.blue.position),
      )
    : [];

  const renderBlitzEffect = (
    color: PlayerColor,
    start: Position,
    path: Position[],
    startStep: number | null,
    progress: number,
  ) => {
    const effectiveStartStep = Math.max(0, startStep ?? 0);
    const pathStart =
      effectiveStartStep > 0 ? path[effectiveStartStep - 1] ?? start : start;
    const visiblePath = path
      .slice(effectiveStartStep, effectiveStartStep + Math.max(0, progress));
    if (visiblePath.length === 0) return null;
    const allPositions = [pathStart, ...visiblePath];
    const mainPoints = allPositions
      .map((position) => {
        const { x, y } = toGridPixel(position, responsiveCellSize);
        return `${x},${y}`;
      })
      .join(' ');
    const branchA = buildBlitzBoltPoints(
      allPositions,
      responsiveCellSize,
      Math.max(4, responsiveCellSize * 0.08),
      0,
    );
    const branchB = buildBlitzBoltPoints(
      allPositions,
      responsiveCellSize,
      Math.max(3, responsiveCellSize * 0.055),
      1,
    );
    const end = visiblePath[visiblePath.length - 1];
    const endPixel = toGridPixel(end, responsiveCellSize);

    return (
      <svg
        className={`ability-blitz-line ability-blitz-line-${color}`}
        width="100%"
        height="100%"
        viewBox={`0 0 ${boardSize} ${boardSize}`}
      >
        <g className="ability-blitz-beam">
          <polyline className="ability-blitz-glow" points={mainPoints} fill="none" />
          <polyline className="ability-blitz-branch ability-blitz-branch-a" points={branchA} fill="none" />
          <polyline className="ability-blitz-branch ability-blitz-branch-b" points={branchB} fill="none" />
          <polyline className="ability-blitz-core" points={branchA} fill="none" />
        </g>
        <g
          className="ability-blitz-impact"
          transform={`translate(${endPixel.x} ${endPixel.y})`}
        >
          <circle className="ability-blitz-impact-ring ability-blitz-impact-ring-outer" r={Math.max(10, responsiveCellSize * 0.3)} />
          <circle className="ability-blitz-impact-ring ability-blitz-impact-ring-inner" r={Math.max(5, responsiveCellSize * 0.14)} />
          <circle className="ability-blitz-impact-core" r={Math.max(5, responsiveCellSize * 0.1)} />
        </g>
      </svg>
    );
  };

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

        {state.lavaTiles.map((tile) => (
          <div
            key={`lava-${tile.position.row}-${tile.position.col}`}
            className="ability-lava-tile"
            style={{
              left: tile.position.col * responsiveCellSize,
              top: tile.position.row * responsiveCellSize,
              width: responsiveCellSize,
              height: responsiveCellSize,
            }}
          />
        ))}

        {isPlanning && infernoMarker ? (
          <div
            className="ability-inferno-marker"
            style={{
              left: infernoMarker.col * responsiveCellSize + responsiveCellSize / 2,
              top: infernoMarker.row * responsiveCellSize + responsiveCellSize / 2,
              width: Math.max(32, responsiveCellSize * 0.5),
              height: Math.max(32, responsiveCellSize * 0.5),
              transform: 'translate(-50%, -50%)',
            }}
          >
            🔥
          </div>
        ) : null}

        {teleportTargets.map((target) => (
          <button
            key={`tele-${target.row}-${target.col}`}
            type="button"
            className="ability-teleport-target"
            style={{
              left: target.col * responsiveCellSize + responsiveCellSize / 2,
              top: target.row * responsiveCellSize + responsiveCellSize / 2,
              width: Math.max(32, responsiveCellSize * 0.5),
              height: Math.max(32, responsiveCellSize * 0.5),
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

        {infernoTargets.map((target) => (
          <button
            key={`inferno-${target.row}-${target.col}`}
            type="button"
            className="ability-inferno-target"
            style={{
              left: target.col * responsiveCellSize + responsiveCellSize / 2,
              top: target.row * responsiveCellSize + responsiveCellSize / 2,
              width: Math.max(32, responsiveCellSize * 0.5),
              height: Math.max(32, responsiveCellSize * 0.5),
              transform: 'translate(-50%, -50%)',
            }}
            onClick={() => onInfernoTargetSelect(target)}
          />
        ))}

        {isPlaybackPhase ? (
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
        {movingBlitzColors.red &&
          renderBlitzEffect(
            'red',
            movingStarts?.red ?? state.players.red.position,
            movingPaths.red,
            movingBlitzSteps.red,
            movingBlitzProgress.red,
          )}
        {isPlaybackPhase ? (
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
        {movingBlitzColors.blue &&
          renderBlitzEffect(
            'blue',
            movingStarts?.blue ?? state.players.blue.position,
            movingPaths.blue,
            movingBlitzSteps.blue,
            movingBlitzProgress.blue,
          )}

        {teleportMarker && !isPlaybackPhase && (
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

        {isPlaybackPhase &&
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

        {chargeEffects.map((effect) => (
          <div
            key={`charge-${effect.id}`}
            className={`ability-charge-effect ability-charge-effect-${effect.color}`}
            style={{
              left: effect.position.col * responsiveCellSize + responsiveCellSize / 2,
              top: effect.position.row * responsiveCellSize + responsiveCellSize / 2,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <span className="ability-charge-wave ability-charge-wave-a" />
            <span className="ability-charge-wave ability-charge-wave-b" />
            <span className="ability-charge-float">
              <span className="ability-charge-icon">⚡</span>
              <span className="ability-charge-text">+4</span>
            </span>
          </div>
        ))}

        {healEffects.map((effect) => (
          <div
            key={`heal-${effect.id}`}
            className={`ability-heal-effect ability-heal-effect-${effect.color}`}
            style={{
              left: effect.position.col * responsiveCellSize + responsiveCellSize / 2,
              top: effect.position.row * responsiveCellSize + responsiveCellSize / 2,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <span className="ability-heal-wave ability-heal-wave-a" />
            <span className="ability-heal-wave ability-heal-wave-b" />
            <span className="ability-heal-wave ability-heal-wave-c" />
            <span className="ability-heal-float">
              <span className="ability-heal-icon">✚</span>
              <span className="ability-heal-text">+1</span>
            </span>
          </div>
        ))}

        {redVisible && state.players.red.overdriveActive && (
          <div
            className="ability-overdrive-effect ability-overdrive-effect-red"
            style={{
              left: displayPositions.red.col * responsiveCellSize + responsiveCellSize / 2,
              top: displayPositions.red.row * responsiveCellSize + responsiveCellSize / 2,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <span className="ability-overdrive-wave ability-overdrive-wave-a" />
            <span className="ability-overdrive-wave ability-overdrive-wave-b" />
            <span className="ability-overdrive-wave ability-overdrive-wave-c" />
          </div>
        )}

        {blueVisible && state.players.blue.overdriveActive && (
          <div
            className="ability-overdrive-effect ability-overdrive-effect-blue"
            style={{
              left: displayPositions.blue.col * responsiveCellSize + responsiveCellSize / 2,
              top: displayPositions.blue.row * responsiveCellSize + responsiveCellSize / 2,
              transform: 'translate(-50%, -50%)',
            }}
          >
            <span className="ability-overdrive-wave ability-overdrive-wave-a" />
            <span className="ability-overdrive-wave ability-overdrive-wave-b" />
            <span className="ability-overdrive-wave ability-overdrive-wave-c" />
          </div>
        )}

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

        {redVisible && (state.players.red.hp > 0 || hitFlags.red || explodingFlags.red) ? (
          <PlayerPiece
            color="red"
            position={displayPositions.red}
            cellSize={responsiveCellSize}
            isAttacker={state.attackerColor === 'red'}
            isHit={hitFlags.red}
            isExploding={explodingFlags.red}
            isMe={currentColor === 'red'}
            isHidden={state.players.red.hidden && currentColor === 'red' && state.phase === 'planning'}
            isPhased={activePhaseShifts.red && state.phase === 'moving'}
            skin={redSkin}
          />
        ) : null}
        {blueVisible && (state.players.blue.hp > 0 || hitFlags.blue || explodingFlags.blue) ? (
          <PlayerPiece
            color="blue"
            position={displayPositions.blue}
            cellSize={responsiveCellSize}
            isAttacker={state.attackerColor === 'blue'}
            isHit={hitFlags.blue}
            isExploding={explodingFlags.blue}
            isMe={currentColor === 'blue'}
            isHidden={state.players.blue.hidden && currentColor === 'blue' && state.phase === 'planning'}
            isPhased={activePhaseShifts.blue && state.phase === 'moving'}
            skin={blueSkin}
          />
        ) : null}
      </div>
    </div>
  );
}


