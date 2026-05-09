import { useRef, useCallback, useEffect, useState } from "react";
import type { BoardSkin, PlayerColor, Position } from "../../types/game.types";
import type {
  AbilityBattleState,
  AbilitySkillReservation,
  AbilityTrapTile,
} from "../../types/ability.types";
import { useGameStore } from "../../store/gameStore";
import {
  pixelToCell,
  isBlockedCell,
  isValidMove,
  posEqual,
} from "../../utils/pathUtils";
import { playLobbyClick, playPathStepClick } from "../../utils/soundUtils";
import { PlayerPiece } from "../Game/PlayerPiece";
import { PathLine } from "../Game/PathLine";
import { CollisionEffect } from "../Effects/CollisionEffect";
import '../Game/GameGrid.css';

interface Props {
  state: AbilityBattleState;
  currentColor: PlayerColor;
  pathPoints: number;
  myPath: Position[];
  setMyPath: (path: Position[]) => void;
  displayPositions: { red: Position; blue: Position };
  voidCloakVanishPositions: { red: Position | null; blue: Position | null };
  hitFlags: { red: boolean; blue: boolean };
  explodingFlags: { red: boolean; blue: boolean };
  collisionEffects: Array<{
    id: number;
    position: Position;
    direction: { dx: number; dy: number };
    variant?: "normal" | "berserk";
  }>;
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
  activeAtFields: { red: boolean; blue: boolean };
  activePhaseShifts: { red: boolean; blue: boolean };
  previewStart: Position;
  previewAtomicClone: {
    color: PlayerColor;
    start: Position;
    path: Position[];
    step: number;
  } | null;
  teleportReservation: AbilitySkillReservation | null;
  teleportMarker: Position | null;
  infernoMarker: Position | null;
  rootWallMarker: Position | null;
  iceFieldMarker: Position | null;
  movingTeleportMarkers: { red: Position | null; blue: Position | null };
  movingTeleportSteps: { red: number | null; blue: number | null };
  movingBlitzColors: { red: boolean; blue: boolean };
  movingBlitzProgress: { red: number; blue: number };
  movingBlitzSteps: { red: number | null; blue: number | null };
  activeSunChariots: { red: boolean; blue: boolean };
  activeBerserkerRages: { red: boolean; blue: boolean };
  movingAtomicClones: {
    red: {
      start: Position | null;
      path: Position[];
      step: number | null;
      position: Position | null;
    };
    blue: {
      start: Position | null;
      path: Position[];
      step: number | null;
      position: Position | null;
    };
  };
  movingPaths: { red: Position[]; blue: Position[] };
  movingRootWallBlockedPaths: {
    red: { start: Position; path: Position[] } | null;
    blue: { start: Position; path: Position[] } | null;
  };
  movingIceSlideOverriddenPaths: {
    red: { start: Position; path: Position[] } | null;
    blue: { start: Position; path: Position[] } | null;
  };
  movingStarts: { red: Position; blue: Position } | null;
  timeRewindFocusColor: PlayerColor | null;
  timeRewindActive: boolean;
  rewindingPieceColor: PlayerColor | null;
  cellSize: number;
  isPlanning: boolean;
  canEditPath: boolean;
  teleportTargetsVisible: boolean;
  blitzTargetsVisible: boolean;
  infernoTargetsVisible: boolean;
  rootWallTargetsVisible: boolean;
  iceFieldTargetsVisible: boolean;
  keyboardTarget: Position | null;
  onTeleportTargetSelect: (target: Position) => void;
  onBlitzTargetSelect: (target: Position) => void;
  onInfernoTargetSelect: (target: Position) => void;
  onRootWallTargetSelect: (target: Position) => void;
  onIceFieldTargetSelect: (target: Position) => void;
  onTeleportCancel: () => void;
  trapTiles: AbilityTrapTile[];
  magicMineCastingColors: { red: boolean; blue: boolean };
  myBlitzReserved: boolean;
  shakeKey?: number;
  arena?: number;
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
    .join(" ");
}


export function AbilityGrid({
  state,
  currentColor,
  pathPoints,
  myPath,
  setMyPath,
  displayPositions,
  voidCloakVanishPositions,
  hitFlags,
  explodingFlags,
  collisionEffects,
  teleportEffects,
  chargeEffects,
  healEffects,
  activeGuards,
  activeAtFields,
  activePhaseShifts,
  previewStart,
  previewAtomicClone,
  teleportReservation,
  teleportMarker,
  infernoMarker,
  rootWallMarker,
  iceFieldMarker,
  movingTeleportMarkers,
  movingTeleportSteps,
  movingBlitzColors,
  movingBlitzProgress,
  movingBlitzSteps,
  activeSunChariots,
  activeBerserkerRages,
  movingAtomicClones,
  movingPaths,
  movingRootWallBlockedPaths,
  movingIceSlideOverriddenPaths,
  movingStarts,
  timeRewindFocusColor,
  timeRewindActive,
  rewindingPieceColor,
  cellSize,
  isPlanning,
  canEditPath,
  teleportTargetsVisible,
  blitzTargetsVisible,
  infernoTargetsVisible,
  rootWallTargetsVisible,
  iceFieldTargetsVisible,
  keyboardTarget,
  onTeleportTargetSelect,
  onBlitzTargetSelect,
  onInfernoTargetSelect,
  onRootWallTargetSelect,
  onIceFieldTargetSelect,
  onTeleportCancel,
  trapTiles,
  magicMineCastingColors,
  myBlitzReserved,
  shakeKey = 0,
  arena = 1,
}: Props) {
  const isSfxMuted = useGameStore((store) => store.isSfxMuted);
  const sfxVolume = useGameStore((store) => store.sfxVolume);
  const boardSkin = useGameStore((store) => store.boardSkin);
  const currentMatchType = useGameStore((store) => store.currentMatchType);
  const shellRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [boardSize, setBoardSize] = useState(
    cellSize * GRID_SIZE || DEFAULT_CELL_SIZE * GRID_SIZE,
  );
  const [hoveredCell, setHoveredCell] = useState<Position | null>(null);
  const [iceSlideActiveColors, setIceSlideActiveColors] = useState({ red: false, blue: false });
  const dragState = useRef<{
    active: boolean;
    fromStart: boolean;
    fromEnd: boolean;
  }>({
    active: false,
    fromStart: false,
    fromEnd: false,
  });

  // Reset ice slide flags whenever the ice slide paths change (new round / cleared)
  useEffect(() => {
    setIceSlideActiveColors({ red: false, blue: false });
  }, [movingIceSlideOverriddenPaths]);

  // Activate ice slide effect once the player reaches the ice obstacle tile
  useEffect(() => {
    setIceSlideActiveColors((prev) => ({
      red: prev.red || (
        !!movingIceSlideOverriddenPaths.red &&
        posEqual(displayPositions.red, movingIceSlideOverriddenPaths.red.start)
      ),
      blue: prev.blue || (
        !!movingIceSlideOverriddenPaths.blue &&
        posEqual(displayPositions.blue, movingIceSlideOverriddenPaths.blue.start)
      ),
    }));
  }, [displayPositions, movingIceSlideOverriddenPaths]);

  useEffect(() => {
    if (!shakeKey) return;
    const el = shellRef.current;
    if (!el) return;
    el.classList.remove('board-shake');
    void el.offsetWidth;
    el.classList.add('board-shake');
    const t = setTimeout(() => el.classList.remove('board-shake'), 130);
    return () => clearTimeout(t);
  }, [shakeKey]);

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
    teleportReservation?.skillId === "quantum_shift"
      ? teleportReservation.step
      : null;
  const teleportTarget =
    teleportReservation?.skillId === "quantum_shift"
      ? (teleportReservation.target ?? null)
      : null;
  const baseStart = state.players[currentColor].position;
  const myStart = previewStart;
  const boardObstacles = state.obstacles;
  const iceFieldPositions = state.iceFieldTiles.map((tile) => tile.position);
  const movementObstacles = [
    ...boardObstacles,
    ...state.rootWallTiles.map((tile) => tile.position),
  ].filter(
    (position) => !iceFieldPositions.some((ice) => posEqual(ice, position)),
  );
  const shouldAnimateInitialObstacles = state.turn === 1;
  const opponentColor = currentColor === "red" ? "blue" : "red";
  const teleportBlockedPositions = [
    ...movementObstacles,
    state.players[opponentColor].position,
  ];
  const redSkin = state.players.red.pieceSkin;
  const blueSkin = state.players.blue.pieceSkin;
  const resolvedBoardSkin: BoardSkin =
    currentMatchType === "friend"
      ? "classic"
      : state.players.red.boardSkin !== "classic"
      ? state.players.red.boardSkin
      : state.players.blue.boardSkin !== "classic"
        ? state.players.blue.boardSkin
        : boardSkin;
  const boardSkinClass =
    arena === 2
      ? "board-skin-arena2"
      : arena === 3
        ? "board-skin-arena3"
        : arena === 4
          ? "board-skin-arena4"
          : arena === 5
            ? "board-skin-arena5"
            : arena === 6
              ? "board-skin-arena6"
              : arena === 7
                ? "board-skin-arena7"
                : arena === 8
                  ? "board-skin-arena8"
                  : arena === 9
                    ? "board-skin-arena9"
                    : arena === 10
                      ? "board-skin-arena10"
          : arena === 11
            ? "board-skin-arena11"
      : resolvedBoardSkin === "blue_gray"
      ? "board-skin-blue-gray"
      : resolvedBoardSkin === "pharaoh"
        ? "board-skin-pharaoh"
        : resolvedBoardSkin === "magic"
          ? "board-skin-magic"
          : "";
  const getCellStyle = (
    row: number,
    col: number,
    blocked: boolean,
  ): React.CSSProperties => {
    const baseStyle: React.CSSProperties = {
      left: col * responsiveCellSize,
      top: row * responsiveCellSize,
      width: responsiveCellSize,
      height: responsiveCellSize,
      ["--cell-size" as string]: `${responsiveCellSize}px`,
      ["--magic-row" as string]: row,
      ["--magic-col" as string]: col,
    };

    const cellUrl =
      arena === 2
        ? `/board/arena2/arena2-cell-${row}-${col}.svg`
        : arena === 3
          ? `/board/arena3/arena3-cell-${row}-${col}.svg`
          : arena === 4
            ? `/board/arena4/arena4-cell-${row}-${col}.svg`
            : arena === 5
              ? `/board/arena5/arena5-cell-${row}-${col}.svg`
              : arena === 6
                ? `/board/arena6/arena6-cell-${row}-${col}.svg`
                : arena === 7
                  ? `/board/arena7/arena7-cell-${row}-${col}.svg`
                  : arena === 8
                    ? `/board/arena8/arena8-cell-${row}-${col}.svg`
                    : arena === 9
                      ? `/board/arena9/arena9-cell-${row}-${col}.svg`
                      : arena === 10
                        ? `/board/arena10/arena10-cell-${row}-${col}.svg`
            : arena === 11
              ? `/board/arena11/arena11-cell-${row}-${col}.svg`
        : resolvedBoardSkin === "magic"
          ? `/board/magic-cells/magic-cell-${row}-${col}.svg`
          : resolvedBoardSkin === "pharaoh"
            ? `/board/pharaoh-cells/pharaoh-cell-${row}-${col}.svg`
            : null;

    if (!cellUrl) {
      return baseStyle;
    }

    return {
      ...baseStyle,
      backgroundImage: blocked
        ? `linear-gradient(135deg, rgba(239, 68, 68, 0.16), rgba(248, 113, 113, 0.06)), url("${cellUrl}")`
        : `url("${cellUrl}")`,
      backgroundSize: "cover",
      backgroundPosition: "center",
      backgroundRepeat: "no-repeat",
    };
  };
  const redVisible =
    !state.players.red.hidden ||
    currentColor === "red" ||
    state.phase !== "planning";
  const blueVisible =
    !state.players.blue.hidden ||
    currentColor === "blue" ||
    state.phase !== "planning";
  const piecesOverlapped =
    redVisible &&
    blueVisible &&
    displayPositions.red.row === displayPositions.blue.row &&
    displayPositions.red.col === displayPositions.blue.col;
  const redHpOffsetY = piecesOverlapped
    ? Math.max(18, Math.round(responsiveCellSize * 0.26))
    : 0;

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
      if (
        teleportTarget &&
        teleportStep !== null &&
        path.length - 1 === teleportStep
      ) {
        return teleportTarget;
      }
      return path[path.length - 2];
    },
    [myStart, teleportStep, teleportTarget],
  );

  const playPathStepSfx = useCallback(() => {
    if (isSfxMuted) return;
    playPathStepClick(sfxVolume);
  }, [isSfxMuted, sfxVolume]);

  const playTargetSelectSfx = useCallback(() => {
    if (isSfxMuted) return;
    playLobbyClick(sfxVolume);
  }, [isSfxMuted, sfxVolume]);

  const removeFromPath = useCallback(() => {
    if (myPath.length > 0) {
      playPathStepSfx();
      setMyPath(myPath.slice(0, -1));
    }
  }, [myPath, playPathStepSfx, setMyPath]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!canEditPath || !gridRef.current) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const cell = pixelToCell(
        e.clientX,
        e.clientY,
        responsiveCellSize,
        getGridOffset(),
      );
      if (!cell) return;
      setHoveredCell(cell);
      if (
        teleportTargetsVisible ||
        blitzTargetsVisible ||
        infernoTargetsVisible ||
        rootWallTargetsVisible ||
        iceFieldTargetsVisible
      ) {
        const currentPos = state.players[currentColor].position;
        if (!posEqual(cell, currentPos)) return;
        if (teleportTargetsVisible) onTeleportCancel();
        if (blitzTargetsVisible) return;
        if (infernoTargetsVisible) return;
        if (rootWallTargetsVisible) return;
        if (iceFieldTargetsVisible) return;
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
    [
      blitzTargetsVisible,
      canEditPath,
      currentColor,
      getPlanningTailPosition,
      iceFieldTargetsVisible,
      infernoTargetsVisible,
      rootWallTargetsVisible,
      myPath,
      myStart,
      onTeleportCancel,
      responsiveCellSize,
      state.players,
      teleportTargetsVisible,
    ],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const cell = pixelToCell(
        e.clientX,
        e.clientY,
        responsiveCellSize,
        getGridOffset(),
      );
      setHoveredCell(cell);
      if (!dragState.current.active || !canEditPath || !cell) return;
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
        if (
          !posEqual(cell, lastPos) &&
          !isBlockedCell(cell, movementObstacles) &&
          isValidMove(lastPos, cell) &&
          current.length < pathPoints
        ) {
          playPathStepSfx();
          setMyPath([...current, cell]);
        }
      }
    },
    [
      canEditPath,
      getPlanningSecondLastPosition,
      getPlanningTailPosition,
      myPath,
      movementObstacles,
      pathPoints,
      playPathStepSfx,
      removeFromPath,
      responsiveCellSize,
      setMyPath,
    ],
  );

  const handlePointerEnd = useCallback(
    (e?: React.PointerEvent<HTMLDivElement>) => {
      if (e?.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      setHoveredCell(null);
      dragState.current = { active: false, fromStart: false, fromEnd: false };
    },
    [],
  );

  const cells = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => ({
    row: Math.floor(index / GRID_SIZE),
    col: index % GRID_SIZE,
  }));

  const redPath =
    state.phase === "moving" || state.phase === "gameover"
      ? movingPaths.red
      : currentColor === "red"
        ? myPath
        : [];
  const bluePath =
    state.phase === "moving" || state.phase === "gameover"
      ? movingPaths.blue
      : currentColor === "blue"
        ? myPath
        : [];
  const isPlaybackPhase =
    state.phase === "moving" || state.phase === "gameover";

  const teleportOrigin =
    myPath.length > 0
      ? myPath[myPath.length - 1]
      : state.players[currentColor].position;

  const blitzOrigin =
    myPath.length > 0
      ? myPath[myPath.length - 1]
      : state.players[currentColor].position;

  const teleportTargets = teleportTargetsVisible
    ? Array.from({ length: 9 }, (_, index) => ({
        row: teleportOrigin.row + Math.floor(index / 3) - 1,
        col: teleportOrigin.col + (index % 3) - 1,
      })).filter(
        (position) =>
          !(
            position.row === teleportOrigin.row &&
            position.col === teleportOrigin.col
          ) &&
          position.row >= 0 &&
          position.row < GRID_SIZE &&
          position.col >= 0 &&
          position.col < GRID_SIZE &&
          !isBlockedCell(position, teleportBlockedPositions),
      )
    : [];

  const blitzTargets = blitzTargetsVisible
    ? [
        { row: blitzOrigin.row - 1, col: blitzOrigin.col, rotation: 0 },
        { row: blitzOrigin.row + 1, col: blitzOrigin.col, rotation: 180 },
        { row: blitzOrigin.row, col: blitzOrigin.col - 1, rotation: -90 },
        { row: blitzOrigin.row, col: blitzOrigin.col + 1, rotation: 90 },
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

  const rootWallTargets = rootWallTargetsVisible
    ? cells.filter(
        (position) =>
          !posEqual(position, state.players.red.position) &&
          !posEqual(position, state.players.blue.position),
      )
    : [];

  const iceFieldTargets = iceFieldTargetsVisible
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
      effectiveStartStep > 0 ? (path[effectiveStartStep - 1] ?? start) : start;
    const visiblePath = path.slice(
      effectiveStartStep,
      effectiveStartStep + Math.max(0, progress),
    );
    if (visiblePath.length === 0) return null;
    const allPositions = [pathStart, ...visiblePath];
    const mainPoints = allPositions
      .map((position) => {
        const { x, y } = toGridPixel(position, responsiveCellSize);
        return `${x},${y}`;
      })
      .join(" ");
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
          <polyline
            className="ability-blitz-glow"
            points={mainPoints}
            fill="none"
          />
          <polyline
            className="ability-blitz-branch ability-blitz-branch-a"
            points={branchA}
            fill="none"
          />
          <polyline
            className="ability-blitz-branch ability-blitz-branch-b"
            points={branchB}
            fill="none"
          />
          <polyline
            className="ability-blitz-core"
            points={branchA}
            fill="none"
          />
        </g>
        <g
          className="ability-blitz-impact"
          transform={`translate(${endPixel.x} ${endPixel.y})`}
        >
          <circle
            className="ability-blitz-impact-ring ability-blitz-impact-ring-outer"
            r={Math.max(10, responsiveCellSize * 0.3)}
          />
          <circle
            className="ability-blitz-impact-ring ability-blitz-impact-ring-inner"
            r={Math.max(5, responsiveCellSize * 0.14)}
          />
          <circle
            className="ability-blitz-impact-core"
            r={Math.max(5, responsiveCellSize * 0.1)}
          />
        </g>
      </svg>
    );
  };

  return (
    <div ref={shellRef} className="game-grid-shell ability-grid-shell">
      <div
        ref={gridRef}
        className={`game-grid ability-grid ${boardSkinClass}${timeRewindActive ? " is-time-rewinding" : ""}${timeRewindFocusColor ? ` rewind-focus-${timeRewindFocusColor}` : ""}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerEnd}
        onPointerCancel={handlePointerEnd}
        onPointerLeave={() => setHoveredCell(null)}
        style={{ width: boardSize, height: boardSize }}
      >
        {cells.map(({ row, col }) => {
          const cell = { row, col };
          const obstacleIndex = boardObstacles.findIndex((obstacle) =>
            posEqual(obstacle, cell),
          );
          const blocked = obstacleIndex >= 0;
          const obstacleEnterDelayMs = Math.min(obstacleIndex, 5) * 45;
          return (
            <div
              key={`${row}-${col}`}
              className={`grid-cell ${blocked ? "obstacle" : ""} ${
                hoveredCell?.row === row && hoveredCell?.col === col
                  ? "is-hovered"
                  : ""
              }`}
              style={getCellStyle(row, col, blocked)}
            >
              {blocked && (
                <div
                  className={`obstacle-mark${shouldAnimateInitialObstacles ? " slide-in-fwd-center" : ""}`}
                  style={
                    shouldAnimateInitialObstacles
                      ? ({
                          "--obstacle-enter-delay": `${obstacleEnterDelayMs}ms`,
                        } as Record<string, string>)
                      : undefined
                  }
                />
              )}
            </div>
          );
        })}

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
          >
            <img
              src="/ui/ability/lava_domain.svg"
              alt=""
              className="ability-lava-tile__img"
              draggable={false}
            />
          </div>
        ))}

        {state.rootWallTiles.map((tile) => (
          <div
            key={`root-wall-${tile.position.row}-${tile.position.col}`}
            className="ability-root-wall-tile"
            style={{
              left: tile.position.col * responsiveCellSize,
              top: tile.position.row * responsiveCellSize,
              width: responsiveCellSize,
              height: responsiveCellSize,
            }}
          >
            <img
              src="/ui/ability/root_wall.svg"
              alt=""
              className="ability-root-wall-tile__img"
              draggable={false}
            />
          </div>
        ))}

        {state.iceFieldTiles.map((tile) => (
          <div
            key={`ice-field-${tile.position.row}-${tile.position.col}`}
            className="ability-ice-field-tile"
            style={{
              left: tile.position.col * responsiveCellSize,
              top: tile.position.row * responsiveCellSize,
              width: responsiveCellSize,
              height: responsiveCellSize,
            }}
          >
            <img
              src="/ui/ability/ice_field.svg"
              alt=""
              className="ability-ice-field-tile__img"
              draggable={false}
            />
          </div>
        ))}

        {trapTiles.map((trap) => (
          <div
            key={`mine-${trap.position.row}-${trap.position.col}`}
            className="ability-wizard-mine"
            style={{
              left:
                trap.position.col * responsiveCellSize + responsiveCellSize / 2,
              top:
                trap.position.row * responsiveCellSize + responsiveCellSize / 2,
              width: responsiveCellSize * 0.85,
              height: responsiveCellSize * 0.85,
            }}
          >
            <svg
              viewBox="0 0 100 100"
              style={{ width: "100%", height: "100%", overflow: "visible" }}
            >
              {/* Outer ring — rotates CW slowly */}
              <g className="mine-g-outer">
                <circle
                  cx="50"
                  cy="50"
                  r="46"
                  fill="none"
                  stroke="rgba(200,80,255,0.38)"
                  strokeWidth="0.8"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="39"
                  fill="none"
                  stroke="rgba(180,60,255,0.25)"
                  strokeWidth="0.55"
                  strokeDasharray="3.5 4.5"
                />
                {Array.from({ length: 12 }).map((_, i) => {
                  const a = ((i * 30 - 90) * Math.PI) / 180;
                  const major = i % 3 === 0;
                  const r1 = major ? 40 : 43;
                  return (
                    <line
                      key={i}
                      x1={50 + r1 * Math.cos(a)}
                      y1={50 + r1 * Math.sin(a)}
                      x2={50 + 47 * Math.cos(a)}
                      y2={50 + 47 * Math.sin(a)}
                      stroke={
                        major
                          ? "rgba(230,110,255,0.82)"
                          : "rgba(200,80,255,0.5)"
                      }
                      strokeWidth={major ? "1.4" : "0.7"}
                    />
                  );
                })}
                {Array.from({ length: 8 }).map((_, i) => {
                  const a = ((i * 45 - 90) * Math.PI) / 180;
                  return (
                    <circle
                      key={i}
                      cx={50 + 43 * Math.cos(a)}
                      cy={50 + 43 * Math.sin(a)}
                      r="1.8"
                      fill="rgba(230,110,255,0.9)"
                    />
                  );
                })}
              </g>

              {/* Hexagram — rotates CCW */}
              <g className="mine-g-hex">
                <polygon
                  points="50,7 87,72 13,72"
                  fill="rgba(150,30,255,0.05)"
                  stroke="rgba(205,85,255,0.72)"
                  strokeWidth="1.3"
                />
                <polygon
                  points="50,93 87,28 13,28"
                  fill="none"
                  stroke="rgba(220,110,255,0.58)"
                  strokeWidth="1.1"
                />
                {[
                  { x: 50, y: 7 },
                  { x: 87, y: 72 },
                  { x: 13, y: 72 },
                  { x: 50, y: 93 },
                  { x: 87, y: 28 },
                  { x: 13, y: 28 },
                ].map((p, i) => (
                  <circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r="2.5"
                    fill="rgba(235,115,255,0.85)"
                    stroke="rgba(255,180,255,0.45)"
                    strokeWidth="0.5"
                  />
                ))}
              </g>

              {/* Inner ring — rotates CW faster */}
              <g className="mine-g-inner">
                <circle
                  cx="50"
                  cy="50"
                  r="22"
                  fill="rgba(140,20,255,0.06)"
                  stroke="rgba(195,75,255,0.58)"
                  strokeWidth="0.9"
                />
                <circle
                  cx="50"
                  cy="50"
                  r="14"
                  fill="none"
                  stroke="rgba(185,65,255,0.3)"
                  strokeWidth="0.6"
                  strokeDasharray="2.5 3.2"
                />
                {Array.from({ length: 6 }).map((_, i) => {
                  const a = ((i * 60 - 90) * Math.PI) / 180;
                  return (
                    <line
                      key={i}
                      x1={50 + 14 * Math.cos(a)}
                      y1={50 + 14 * Math.sin(a)}
                      x2={50 + 22 * Math.cos(a)}
                      y2={50 + 22 * Math.sin(a)}
                      stroke="rgba(205,85,255,0.55)"
                      strokeWidth="0.8"
                    />
                  );
                })}
                {Array.from({ length: 6 }).map((_, i) => {
                  const a = ((i * 60 - 60) * Math.PI) / 180;
                  return (
                    <circle
                      key={i}
                      cx={50 + 22 * Math.cos(a)}
                      cy={50 + 22 * Math.sin(a)}
                      r="1.4"
                      fill="rgba(215,95,255,0.75)"
                    />
                  );
                })}
              </g>

              {/* Center orb */}
              <circle
                cx="50"
                cy="50"
                r="5.5"
                fill="rgba(185,55,255,0.18)"
                stroke="rgba(235,125,255,0.65)"
                strokeWidth="0.9"
              />
              <circle cx="50" cy="50" r="2.8" fill="rgba(255,215,255,0.95)" />
            </svg>
          </div>
        ))}


        {isPlanning && infernoMarker ? (
          <div
            className="ability-inferno-marker"
            style={{
              left:
                infernoMarker.col * responsiveCellSize + responsiveCellSize / 2,
              top:
                infernoMarker.row * responsiveCellSize + responsiveCellSize / 2,
              width: Math.max(32, responsiveCellSize * 0.5),
              height: Math.max(32, responsiveCellSize * 0.5),
              transform: "translate(-50%, -50%)",
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
              left: target.col * responsiveCellSize,
              top: target.row * responsiveCellSize,
              width: responsiveCellSize,
              height: responsiveCellSize,
            }}
            onClick={() => {
              playTargetSelectSfx();
              onTeleportTargetSelect(target);
            }}
          />
        ))}

        {blitzTargets.map((target) => (
          <button
            key={`blitz-${target.row}-${target.col}`}
            type="button"
            className="ability-blitz-target"
            style={{
              left: target.col * responsiveCellSize,
              top: target.row * responsiveCellSize,
              width: responsiveCellSize,
              height: responsiveCellSize,
            }}
            onClick={() => {
              playTargetSelectSfx();
              onBlitzTargetSelect(target);
            }}
          >
            <img
              src="/ui/ability/skill_arrow_icon.svg"
              alt=""
              className="ability-blitz-target-arrow"
              style={{ transform: `rotate(${target.rotation}deg)` }}
            />
          </button>
        ))}

        {infernoTargets.map((target) => (
          <button
            key={`inferno-${target.row}-${target.col}`}
            type="button"
            className="ability-inferno-target"
            style={{
              left: target.col * responsiveCellSize,
              top: target.row * responsiveCellSize,
              width: responsiveCellSize,
              height: responsiveCellSize,
            }}
            onClick={() => {
              playTargetSelectSfx();
              onInfernoTargetSelect(target);
            }}
          />
        ))}

        {isPlanning && rootWallMarker ? (
          <div
            className="ability-root-wall-marker"
            style={{
              left: rootWallMarker.col * responsiveCellSize + responsiveCellSize / 2,
              top: rootWallMarker.row * responsiveCellSize + responsiveCellSize / 2,
              width: Math.max(32, responsiveCellSize * 0.5),
              height: Math.max(32, responsiveCellSize * 0.5),
              transform: "translate(-50%, -50%)",
            }}
          >
            🌿
          </div>
        ) : null}

        {isPlanning && iceFieldMarker ? (
          <div
            className="ability-ice-field-tile ability-ice-field-tile--pending"
            style={{
              left: iceFieldMarker.col * responsiveCellSize,
              top: iceFieldMarker.row * responsiveCellSize,
              width: responsiveCellSize,
              height: responsiveCellSize,
            }}
          >
            <img
              src="/ui/ability/ice_field.svg"
              alt=""
              className="ability-ice-field-tile__img"
              draggable={false}
            />
          </div>
        ) : null}

        {rootWallTargets.map((target) => (
          <button
            key={`root-wall-${target.row}-${target.col}`}
            type="button"
            className="ability-root-wall-target"
            style={{
              left: target.col * responsiveCellSize,
              top: target.row * responsiveCellSize,
              width: responsiveCellSize,
              height: responsiveCellSize,
            }}
            onClick={() => {
              playTargetSelectSfx();
              onRootWallTargetSelect(target);
            }}
          />
        ))}

        {iceFieldTargets.map((target) => (
          <button
            key={`ice-field-target-${target.row}-${target.col}`}
            type="button"
            className="ability-root-wall-target"
            style={{
              left: target.col * responsiveCellSize,
              top: target.row * responsiveCellSize,
              width: responsiveCellSize,
              height: responsiveCellSize,
            }}
            onClick={() => {
              playTargetSelectSfx();
              onIceFieldTargetSelect(target);
            }}
          />
        ))}

        {keyboardTarget &&
          (teleportTargetsVisible ||
            blitzTargetsVisible ||
            infernoTargetsVisible ||
            rootWallTargetsVisible ||
            iceFieldTargetsVisible) && (
            <div
              className="ability-keyboard-target-outline"
              style={{
                left: keyboardTarget.col * responsiveCellSize,
                top: keyboardTarget.row * responsiveCellSize,
                width: responsiveCellSize,
                height: responsiveCellSize,
              }}
            />
          )}

        {isPlaybackPhase ? (
          <>
            {movingRootWallBlockedPaths.red ? (
              <PathLine
                color="red"
                path={movingRootWallBlockedPaths.red.path}
                startPos={movingRootWallBlockedPaths.red.start}
                cellSize={responsiveCellSize}
                isPlanning={false}
                muted
              />
            ) : null}
            {movingIceSlideOverriddenPaths.red ? (
              <PathLine
                color="red"
                path={movingIceSlideOverriddenPaths.red.path}
                startPos={movingIceSlideOverriddenPaths.red.start}
                cellSize={responsiveCellSize}
                isPlanning={false}
                muted
              />
            ) : null}
            {movingTeleportMarkers.red && movingTeleportSteps.red !== null ? (
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
            )}
          </>
        ) : currentColor !== "red" ||
          !teleportTarget ||
          teleportStep === null ? (
          <PathLine
            color="red"
            path={redPath}
            startPos={
              currentColor === "red" ? myStart : state.players.red.position
            }
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
            "red",
            movingStarts?.red ?? state.players.red.position,
            movingPaths.red,
            movingBlitzSteps.red,
            movingBlitzProgress.red,
          )}
        {isPlaybackPhase ? (
          <>
            {movingRootWallBlockedPaths.blue ? (
              <PathLine
                color="blue"
                path={movingRootWallBlockedPaths.blue.path}
                startPos={movingRootWallBlockedPaths.blue.start}
                cellSize={responsiveCellSize}
                isPlanning={false}
                muted
              />
            ) : null}
            {movingIceSlideOverriddenPaths.blue ? (
              <PathLine
                color="blue"
                path={movingIceSlideOverriddenPaths.blue.path}
                startPos={movingIceSlideOverriddenPaths.blue.start}
                cellSize={responsiveCellSize}
                isPlanning={false}
                muted
              />
            ) : null}
            {movingTeleportMarkers.blue && movingTeleportSteps.blue !== null ? (
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
            )}
          </>
        ) : currentColor !== "blue" ||
          !teleportTarget ||
          teleportStep === null ? (
          <PathLine
            color="blue"
            path={bluePath}
            startPos={
              currentColor === "blue" ? myStart : state.players.blue.position
            }
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
            "blue",
            movingStarts?.blue ?? state.players.blue.position,
            movingPaths.blue,
            movingBlitzSteps.blue,
            movingBlitzProgress.blue,
          )}

        {isPlanning && previewAtomicClone && (
          <>
            <PathLine
              color={previewAtomicClone.color}
              path={previewAtomicClone.path}
              startPos={previewAtomicClone.start}
              cellSize={responsiveCellSize}
              isPlanning
            />
            <PlayerPiece
              color={previewAtomicClone.color}
              position={previewAtomicClone.start}
              cellSize={responsiveCellSize}
              isAttacker={state.attackerColor === previewAtomicClone.color}
              isHit={false}
              isExploding={false}
              isMe={currentColor === previewAtomicClone.color}
              isRewinding={false}
              isClone
              skin={previewAtomicClone.color === "red" ? redSkin : blueSkin}
            />
          </>
        )}

        {(["red", "blue"] as const).map((color) => {
          const clone = movingAtomicClones[color];
          if (!clone.start || clone.path.length === 0 || !clone.position)
            return null;
          return (
            <div key={`atomic-clone-${color}`}>
              <PathLine
                color={color}
                path={clone.path}
                startPos={clone.start}
                cellSize={responsiveCellSize}
                isPlanning={false}
              />
              <PlayerPiece
                color={color}
                position={clone.position}
                cellSize={responsiveCellSize}
                isAttacker={state.attackerColor === color}
                isHit={false}
                isExploding={false}
                isMe={currentColor === color}
                isRewinding={false}
                isClone
                skin={color === "red" ? redSkin : blueSkin}
              />
            </div>
          );
        })}

        {teleportMarker && !isPlaybackPhase && (
          <div
            className="ability-teleport-marker"
            style={{
              left:
                teleportMarker.col * responsiveCellSize +
                responsiveCellSize / 2,
              top:
                teleportMarker.row * responsiveCellSize +
                responsiveCellSize / 2,
              width: Math.max(24, responsiveCellSize * 0.34),
              height: Math.max(24, responsiveCellSize * 0.34),
              transform: "translate(-50%, -50%)",
            }}
          >
            ✦
          </div>
        )}

        {isPlaybackPhase &&
          (["red", "blue"] as const).map((color) => {
            const marker = movingTeleportMarkers[color];
            if (!marker) return null;
            return (
              <div
                key={`moving-teleport-${color}`}
                className="ability-teleport-marker"
                style={{
                  left:
                    marker.col * responsiveCellSize + responsiveCellSize / 2,
                  top: marker.row * responsiveCellSize + responsiveCellSize / 2,
                  width: Math.max(24, responsiveCellSize * 0.34),
                  height: Math.max(24, responsiveCellSize * 0.34),
                  transform: "translate(-50%, -50%)",
                }}
              >
                ✦
              </div>
            );
          })}

        {collisionEffects.map(({ id, position, direction, variant }) => (
          <CollisionEffect
            key={id}
            position={position}
            cellSize={responsiveCellSize}
            direction={direction}
            variant={variant}
          />
        ))}

        {teleportEffects.map((effect) => (
          <div key={`teleport-${effect.id}`}>
            <div
              className={`ability-teleport-burst ability-teleport-burst-depart ability-teleport-burst-${effect.color}`}
              style={{
                left:
                  effect.from.col * responsiveCellSize + responsiveCellSize / 2,
                top:
                  effect.from.row * responsiveCellSize + responsiveCellSize / 2,
                width: Math.max(34, responsiveCellSize * 0.72),
                height: Math.max(34, responsiveCellSize * 0.72),
                transform: "translate(-50%, -50%)",
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
                left:
                  effect.to.col * responsiveCellSize + responsiveCellSize / 2,
                top:
                  effect.to.row * responsiveCellSize + responsiveCellSize / 2,
                width: Math.max(38, responsiveCellSize * 0.8),
                height: Math.max(38, responsiveCellSize * 0.8),
                transform: "translate(-50%, -50%)",
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
              left:
                effect.position.col * responsiveCellSize +
                responsiveCellSize / 2,
              top:
                effect.position.row * responsiveCellSize +
                responsiveCellSize / 2,
              transform: "translate(-50%, -50%)",
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
              left:
                effect.position.col * responsiveCellSize +
                responsiveCellSize / 2,
              top:
                effect.position.row * responsiveCellSize +
                responsiveCellSize / 2,
              transform: "translate(-50%, -50%)",
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
              left:
                displayPositions.red.col * responsiveCellSize +
                responsiveCellSize / 2,
              top:
                displayPositions.red.row * responsiveCellSize +
                responsiveCellSize / 2,
              transform: "translate(-50%, -50%)",
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
              left:
                displayPositions.blue.col * responsiveCellSize +
                responsiveCellSize / 2,
              top:
                displayPositions.blue.row * responsiveCellSize +
                responsiveCellSize / 2,
              transform: "translate(-50%, -50%)",
            }}
          >
            <span className="ability-overdrive-wave ability-overdrive-wave-a" />
            <span className="ability-overdrive-wave ability-overdrive-wave-b" />
            <span className="ability-overdrive-wave ability-overdrive-wave-c" />
          </div>
        )}

        {redVisible &&
        (state.players.red.hp > 0 ||
          hitFlags.red ||
          explodingFlags.red ||
          rewindingPieceColor === "red") ? (
          <>
            <PlayerPiece
              color="red"
              position={displayPositions.red}
              cellSize={responsiveCellSize}
              isAttacker={state.attackerColor === "red"}
              isHit={hitFlags.red}
              isExploding={explodingFlags.red}
              isMe={currentColor === "red"}
              isHidden={false}
              isCloaked={
                state.players.red.hidden &&
                currentColor === "red" &&
                state.phase === "planning"
              }
              isGuard={activeGuards.red}
              isAtField={activeAtFields.red && state.phase === "moving"}
              isPhased={activePhaseShifts.red && state.phase === "moving"}
              isOverloaded={
                state.players.red.reboundLocked ||
                (currentColor !== "red" &&
                  state.players.red.connected === false)
              }
              isIceSliding={iceSlideActiveColors.red}
              isBlitzing={movingBlitzProgress.red > 0}
              isSunChariotActive={activeSunChariots.red}
              isBerserkerRage={activeBerserkerRages.red}
              isRewinding={rewindingPieceColor === "red"}
              isMagicMineCasting={magicMineCastingColors.red}
              isBlitzRingActive={(isPlanning && currentColor === "red" && myBlitzReserved) || (isPlaybackPhase && movingBlitzColors.red)}
              hp={state.players.red.hp}
              maxHp={5}
              hpOffsetY={redHpOffsetY}
              skin={redSkin}
            />
          </>
        ) : null}
        {voidCloakVanishPositions.red ? (
          <PlayerPiece
            key={`red-void-cloak-vanish-${state.turn}-${voidCloakVanishPositions.red.row}-${voidCloakVanishPositions.red.col}`}
            color="red"
            position={voidCloakVanishPositions.red}
            cellSize={responsiveCellSize}
            isAttacker={state.attackerColor === "red"}
            isHit={false}
            isExploding={false}
            isMe={currentColor === "red"}
            isHidden
            skin={redSkin}
          />
        ) : null}
        {blueVisible &&
        (state.players.blue.hp > 0 ||
          hitFlags.blue ||
          explodingFlags.blue ||
          rewindingPieceColor === "blue") ? (
          <>
            <PlayerPiece
              color="blue"
              position={displayPositions.blue}
              cellSize={responsiveCellSize}
              isAttacker={state.attackerColor === "blue"}
              isHit={hitFlags.blue}
              isExploding={explodingFlags.blue}
              isMe={currentColor === "blue"}
              isHidden={false}
              isCloaked={
                state.players.blue.hidden &&
                currentColor === "blue" &&
                state.phase === "planning"
              }
              isGuard={activeGuards.blue}
              isAtField={activeAtFields.blue && state.phase === "moving"}
              isPhased={activePhaseShifts.blue && state.phase === "moving"}
              isOverloaded={
                state.players.blue.reboundLocked ||
                (currentColor !== "blue" &&
                  state.players.blue.connected === false)
              }
              isIceSliding={iceSlideActiveColors.blue}
              isBlitzing={movingBlitzProgress.blue > 0}
              isSunChariotActive={activeSunChariots.blue}
              isBerserkerRage={activeBerserkerRages.blue}
              isRewinding={rewindingPieceColor === "blue"}
              isMagicMineCasting={magicMineCastingColors.blue}
              isBlitzRingActive={(isPlanning && currentColor === "blue" && myBlitzReserved) || (isPlaybackPhase && movingBlitzColors.blue)}
              hp={state.players.blue.hp}
              maxHp={5}
              skin={blueSkin}
            />
          </>
        ) : null}
        {voidCloakVanishPositions.blue ? (
          <PlayerPiece
            key={`blue-void-cloak-vanish-${state.turn}-${voidCloakVanishPositions.blue.row}-${voidCloakVanishPositions.blue.col}`}
            color="blue"
            position={voidCloakVanishPositions.blue}
            cellSize={responsiveCellSize}
            isAttacker={state.attackerColor === "blue"}
            isHit={false}
            isExploding={false}
            isMe={currentColor === "blue"}
            isHidden
            skin={blueSkin}
          />
        ) : null}
      </div>
    </div>
  );
}
