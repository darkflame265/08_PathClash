import { useCallback, useEffect, useRef, useState } from 'react';
import { getSocket } from '../../socket/socketClient';
import { getEstimatedServerNow } from '../../socket/timeSync';
import { useGameStore } from '../../store/gameStore';
import type { Position } from '../../types/game.types';
import type {
  TwoVsTwoClientState,
  TwoVsTwoRoundStartPayload,
  TwoVsTwoSlot,
} from '../../types/twovtwo.types';
import { CollisionEffect } from '../Effects/CollisionEffect';
import { PathLine } from '../Game/PathLine';
import { PlayerPiece } from '../Game/PlayerPiece';
import '../Game/GameGrid.css';
import {
  isBlockedCell,
  isValidMove,
  pixelToCell,
  posEqual,
} from '../../utils/pathUtils';
import './TwoVsTwoScreen.css';

const DEFAULT_CELL_SIZE = 96;
const GRID_SIZE = 5;
const PRE_SUBMIT_LEAD_MS = 250;
const PATH_UPDATE_THROTTLE_MS = 150;

type DisplayPositions = Record<TwoVsTwoSlot, Position>;

interface Props {
  state: TwoVsTwoClientState;
  roundInfo: TwoVsTwoRoundStartPayload | null;
  currentSlot: TwoVsTwoSlot;
  myPath: Position[];
  allyPath: Position[];
  enemyPaths: Record<TwoVsTwoSlot, Position[]>;
  setMyPath: (path: Position[]) => void;
  setMySubmitted: () => void;
  hitSlots: TwoVsTwoSlot[];
  explodingSlots: TwoVsTwoSlot[];
  collisionEffects: { id: number; position: Position }[];
}

export function TwoVsTwoGrid({
  state,
  roundInfo,
  currentSlot,
  myPath,
  allyPath,
  enemyPaths,
  setMyPath,
  setMySubmitted,
  hitSlots,
  explodingSlots,
  collisionEffects,
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
  const me = state.players[currentSlot];
  const myTeam = me.team;
  const obstacles = state.obstacles;
  const twoVsTwoDisplayPositions = useGameStore((store) => store.twoVsTwoDisplayPositions);
  const twoVsTwoAnimation = useGameStore((store) => store.twoVsTwoAnimation);
  const displayPositions: DisplayPositions =
    twoVsTwoDisplayPositions ??
    (Object.fromEntries(
      (Object.keys(state.players) as TwoVsTwoSlot[]).map((slot) => [slot, state.players[slot].position]),
    ) as DisplayPositions);

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
    getSocket().emit('twovtwo_path_update', { path });
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
      if (!isPlanning || me.hp <= 0) return;
      const current = myPath;
      if (current.length >= state.pathPoints) return;
      if (isBlockedCell(cell, obstacles)) return;
      const lastPos = current.length > 0 ? current[current.length - 1] : me.position;
      if (isValidMove(lastPos, cell)) {
        setMyPath([...current, cell]);
      }
    },
    [isPlanning, me.hp, me.position, myPath, obstacles, setMyPath, state.pathPoints],
  );

  const removeFromPath = useCallback(() => {
    if (myPath.length > 0) {
      setMyPath(myPath.slice(0, -1));
    }
  }, [myPath, setMyPath]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isPlanning || me.hp <= 0 || !gridRef.current) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const cell = pixelToCell(
        e.clientX,
        e.clientY,
        responsiveCellSize,
        getGridOffset(),
      );
      if (!cell) return;

      const isOnPiece = posEqual(cell, me.position) && myPath.length === 0;
      const isOnEnd = myPath.length > 0 && posEqual(cell, myPath[myPath.length - 1]);
      const isOnPieceWithPath = posEqual(cell, me.position);

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
    [isPlanning, me.hp, me.position, myPath, responsiveCellSize],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!dragState.current.active || !isPlanning || me.hp <= 0) return;
      e.preventDefault();
      const cell = pixelToCell(
        e.clientX,
        e.clientY,
        responsiveCellSize,
        getGridOffset(),
      );
      if (!cell) return;

      if (myPath.length > 0) {
        const secondLast = myPath.length >= 2 ? myPath[myPath.length - 2] : me.position;
        if (posEqual(cell, secondLast)) {
          dragState.current = { active: true, fromPiece: false, fromEnd: true };
          removeFromPath();
          return;
        }
      }

      if (dragState.current.fromEnd) {
        const lastPos = myPath.length > 0 ? myPath[myPath.length - 1] : me.position;
        if (
          !posEqual(cell, lastPos) &&
          !isBlockedCell(cell, obstacles) &&
          isValidMove(lastPos, cell) &&
          myPath.length < state.pathPoints
        ) {
          setMyPath([...myPath, cell]);
        }
      } else if (dragState.current.fromPiece) {
        addToPath(cell);
      }
    },
    [addToPath, isPlanning, me.hp, me.position, myPath, obstacles, removeFromPath, responsiveCellSize, setMyPath, state.pathPoints],
  );

  const handlePointerEnd = useCallback((e?: React.PointerEvent<HTMLDivElement>) => {
    if (e?.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    dragState.current = { active: false, fromPiece: false, fromEnd: false };
  }, []);

  useEffect(() => {
    pendingPathRef.current = myPath;
    if (!isPlanning || me.hp <= 0 || me.pathSubmitted) return;

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
  }, [emitPathUpdate, isPlanning, me.hp, me.pathSubmitted, myPath]);

  useEffect(() => {
    return () => {
      if (pendingPathUpdateRef.current !== null) {
        window.clearTimeout(pendingPathUpdateRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isPlanning || !roundInfo || me.hp <= 0 || me.pathSubmitted) return;
    const submitAtMs = roundInfo.roundEndsAt;
    const submitCurrentPath = () => {
      if (state.phase !== 'planning' || state.players[currentSlot].pathSubmitted) return;
      flushPendingPathUpdate();
      getSocket().emit(
        'twovtwo_submit_path',
        { path: pendingPathRef.current },
        ({ ok, acceptedPath }: { ok: boolean; acceptedPath: Position[] }) => {
          if (!ok) return;
          setMyPath(acceptedPath);
          setMySubmitted();
        },
      );
    };

    const preSubmitDelayMs = Math.max(
      0,
      submitAtMs - getEstimatedServerNow() - PRE_SUBMIT_LEAD_MS,
    );
    const finalSubmitDelayMs = Math.max(0, submitAtMs - getEstimatedServerNow());

    const preSubmitTimeoutId = window.setTimeout(submitCurrentPath, preSubmitDelayMs);
    const finalSubmitTimeoutId = window.setTimeout(submitCurrentPath, finalSubmitDelayMs);
    return () => {
      window.clearTimeout(preSubmitTimeoutId);
      window.clearTimeout(finalSubmitTimeoutId);
    };
  }, [currentSlot, flushPendingPathUpdate, isPlanning, me.hp, me.pathSubmitted, roundInfo, setMyPath, setMySubmitted, state]);

  const cells = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => ({
    row: Math.floor(i / GRID_SIZE),
    col: i % GRID_SIZE,
  }));

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

        {Object.entries(twoVsTwoAnimation?.paths ?? enemyPaths).map(([slot, path]) => {
          if (!path || path.length === 0) return null;
          const team = state.players[slot as TwoVsTwoSlot].team;
          return (
            <PathLine
              key={slot}
              color={team}
              path={path}
              startPos={state.players[slot as TwoVsTwoSlot].position}
              cellSize={responsiveCellSize}
              isPlanning={state.phase === 'planning'}
            />
          );
        })}
        <PathLine
          color={myTeam}
          path={myPath}
          startPos={state.players[currentSlot].position}
          cellSize={responsiveCellSize}
          isPlanning={state.phase === 'planning'}
        />
        <PathLine
          color={myTeam}
          path={allyPath}
          startPos={Object.values(state.players).find(
            (player) => player.team === myTeam && player.slot !== currentSlot,
          )?.position ?? state.players[currentSlot].position}
          cellSize={responsiveCellSize}
          isPlanning={state.phase === 'planning'}
        />

        {collisionEffects.map(({ id, position }) => (
          <CollisionEffect key={id} position={position} cellSize={responsiveCellSize} />
        ))}

        {Object.values(state.players).map((player) => (
          <PlayerPiece
            key={player.slot}
            color={player.team}
            position={displayPositions[player.slot]}
            cellSize={responsiveCellSize}
            isAttacker={player.role === 'attacker'}
            isHit={hitSlots.includes(player.slot)}
            isExploding={explodingSlots.includes(player.slot)}
            isMe={player.slot === currentSlot}
            outlineColor={
              player.slot === currentSlot
                ? 'green'
                : player.team
            }
            skin={player.pieceSkin}
          />
        ))}
      </div>
    </div>
  );
}
