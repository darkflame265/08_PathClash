import {
  useRef,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { useGameStore } from "../../store/gameStore";
import type { BoardSkin, Position } from "../../types/game.types";
import {
  isBlockedCell,
  isValidMove,
  posEqual,
  pixelToCell,
} from "../../utils/pathUtils";
import { PlayerPiece } from "./PlayerPiece";
import { PathLine } from "./PathLine";
import { CollisionEffect } from "../Effects/CollisionEffect";
import { getSocket } from "../../socket/socketClient";
import { getEstimatedServerNow } from "../../socket/timeSync";
import { playPathStepClick } from "../../utils/soundUtils";
import {
  CONTROLS_SETTINGS_CHANGED_EVENT,
  loadControllerControlsSettings,
  loadKeyboardControlsSettings,
} from "../../settings/controls";
import "./GameGrid.css";

const DEFAULT_CELL_SIZE = 96;
const GRID_SIZE = 5;
const PRE_SUBMIT_LEAD_MS = 250;

interface GridProps {
  cellSize?: number;
  entranceAnimation?: boolean;
  tutorialHint?: ReactNode;
  tutorialHintTarget?: "self" | "opponent";
  tutorialGuidePath?: Position[] | null;
  tutorialAutoSubmit?: boolean;
  tutorialHintAnchor?: Position | null;
  tutorialHintCentered?: boolean;
  tutorialHintBottom?: boolean;
  tutorialHintAbove?: boolean;
}

export function GameGrid({
  cellSize = DEFAULT_CELL_SIZE,
  entranceAnimation = false,
  tutorialHint = null,
  tutorialHintTarget = "self",
  tutorialGuidePath = null,
  tutorialAutoSubmit = false,
  tutorialHintAnchor = null,
  tutorialHintCentered = false,
  tutorialHintBottom = false,
  tutorialHintAbove = false,
}: GridProps) {
  const {
    gameState,
    myColor,
    myPath,
    roundInfo,
    setMyPath,
    pieceSkin,
    boardSkin,
    playerPieceSkins,
    redDisplayPos,
    blueDisplayPos,
    hitEffect,
    explosionEffect,
    collisionEffects,
    isSfxMuted,
    sfxVolume,
  } = useGameStore();

  const shellRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [boardSize, setBoardSize] = useState(cellSize * GRID_SIZE);
  const [hoveredCell, setHoveredCell] = useState<Position | null>(null);
  const [opponentRevealToken, setOpponentRevealToken] = useState(0);
  const [keyboardControls, setKeyboardControls] = useState(
    loadKeyboardControlsSettings,
  );
  const [controllerControls, setControllerControls] = useState(
    loadControllerControlsSettings,
  );
  const previousPhaseRef = useRef(gameState?.phase ?? null);
  const dragState = useRef<{
    active: boolean;
    fromPiece: boolean;
    fromEnd: boolean;
  }>({ active: false, fromPiece: false, fromEnd: false });

  const isPlanning = gameState?.phase === "planning";
  const myPos = myColor ? gameState?.players[myColor]?.position : null;
  const mySubmitted =
    !!myColor && gameState?.players[myColor]?.pathSubmitted === true;
  const canEditPath = isPlanning && !mySubmitted;
  const pathPoints = gameState?.pathPoints ?? 5;
  const obstacles = gameState?.obstacles ?? roundInfo?.obstacles ?? [];
  const redPieceSkin =
    playerPieceSkins?.red ?? (myColor === "red" ? pieceSkin : "classic");
  const bluePieceSkin =
    playerPieceSkins?.blue ?? (myColor === "blue" ? pieceSkin : "classic");
  const resolvedBoardSkin: BoardSkin = (() => {
    if (gameState?.tutorialActive) return "classic";
    const redBoardSkin = gameState?.players.red.boardSkin;
    const blueBoardSkin = gameState?.players.blue.boardSkin;
    if (redBoardSkin && redBoardSkin !== "classic") return redBoardSkin;
    if (blueBoardSkin && blueBoardSkin !== "classic") return blueBoardSkin;
    return boardSkin;
  })();
  const boardSkinClass =
    resolvedBoardSkin === "blue_gray"
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

    if (resolvedBoardSkin !== "magic" && resolvedBoardSkin !== "pharaoh") {
      return baseStyle;
    }

    const cellUrl =
      resolvedBoardSkin === "magic"
        ? `/board/magic-cells/magic-cell-${row}-${col}.svg`
        : `/board/pharaoh-cells/pharaoh-cell-${row}-${col}.svg`;
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

  const getGridOffset = () => {
    const rect = gridRef.current?.getBoundingClientRect();
    return rect ? { x: rect.left, y: rect.top } : { x: 0, y: 0 };
  };

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

  useEffect(() => {
    const syncControls = () => {
      setKeyboardControls(loadKeyboardControlsSettings());
      setControllerControls(loadControllerControlsSettings());
    };

    window.addEventListener(CONTROLS_SETTINGS_CHANGED_EVENT, syncControls);
    window.addEventListener("storage", syncControls);
    return () => {
      window.removeEventListener(CONTROLS_SETTINGS_CHANGED_EVENT, syncControls);
      window.removeEventListener("storage", syncControls);
    };
  }, []);

  const responsiveCellSize = boardSize / GRID_SIZE;
  const tutorialAnchorPos =
    tutorialHintAnchor ??
    (tutorialHintTarget === "opponent"
      ? myColor === "red"
        ? blueDisplayPos
        : myColor === "blue"
          ? redDisplayPos
          : null
      : myColor === "red"
        ? redDisplayPos
        : myColor === "blue"
          ? blueDisplayPos
          : null);
  const tutorialGuideSvgPath = useMemo(() => {
    if (!tutorialGuidePath || tutorialGuidePath.length < 2) return null;
    return tutorialGuidePath
      .map((position, index) => {
        const x = position.col * responsiveCellSize + responsiveCellSize / 2;
        const y = position.row * responsiveCellSize + responsiveCellSize / 2;
        return `${index === 0 ? "M" : "L"} ${x} ${y}`;
      })
      .join(" ");
  }, [responsiveCellSize, tutorialGuidePath]);

  const playPathStepSfx = useCallback(() => {
    if (isSfxMuted) return;
    playPathStepClick(sfxVolume);
  }, [isSfxMuted, sfxVolume]);

  const submitCurrentPath = useCallback(() => {
    if (!myColor) return;
    const state = useGameStore.getState();
    const latestGameState = state.gameState;
    if (!latestGameState || latestGameState.phase !== "planning") return;
    if (latestGameState.players[myColor].pathSubmitted) return;

    getSocket().emit(
      "submit_path",
      { path: state.myPath },
      ({ ok }: { ok: boolean }) => {
        if (!ok) return;

        const freshGameState = useGameStore.getState().gameState;
        if (!freshGameState) return;

        useGameStore.setState({
          gameState: {
            ...freshGameState,
            players: {
              ...freshGameState.players,
              [myColor]: {
                ...freshGameState.players[myColor],
                pathSubmitted: true,
              },
            },
          },
        });
      },
    );
  }, [myColor]);

  const addToPath = useCallback(
    (cell: Position) => {
      if (!canEditPath || !myPos) return;
      const current = useGameStore.getState().myPath;
      if (current.length >= pathPoints) return;
      if (isBlockedCell(cell, obstacles)) return;
      const lastPos = current.length > 0 ? current[current.length - 1] : myPos;
      if (isValidMove(lastPos, cell)) {
        const nextPath = [...current, cell];
        playPathStepSfx();
        setMyPath(nextPath);
      }
    },
    [
      canEditPath,
      myPos,
      obstacles,
      pathPoints,
      playPathStepSfx,
      setMyPath,
    ],
  );

  const removeFromPath = useCallback(() => {
    const current = useGameStore.getState().myPath;
    const state = useGameStore.getState();
    if (
      !state.myColor ||
      state.gameState?.players[state.myColor]?.pathSubmitted
    ) {
      return;
    }
    if (current.length > 0) {
      const nextPath = current.slice(0, -1);
      playPathStepSfx();
      setMyPath(nextPath);
    }
  }, [
    playPathStepSfx,
    setMyPath,
  ]);

  // Pointer handlers cover mouse and touch input with one path.
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!canEditPath || !myPos || !gridRef.current) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const cell = pixelToCell(
        e.clientX,
        e.clientY,
        responsiveCellSize,
        getGridOffset(),
      );
      if (!cell) return;
      setHoveredCell(cell);

      const current = useGameStore.getState().myPath;
      const isOnPiece = posEqual(cell, myPos) && current.length === 0;
      const isOnEnd =
        current.length > 0 && posEqual(cell, current[current.length - 1]);
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
    [canEditPath, myPos, responsiveCellSize],
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
      if (!dragState.current.active || !canEditPath || !myPos || !cell) return;
      e.preventDefault();

      const current = useGameStore.getState().myPath;
      if (current.length > 0) {
        const secondLast =
          current.length >= 2 ? current[current.length - 2] : myPos;
        if (posEqual(cell, secondLast)) {
          dragState.current = { active: true, fromPiece: false, fromEnd: true };
          removeFromPath();
          return;
        }
      }

      if (dragState.current.fromEnd) {
        // New direction from the current endpoint.
        const lastPos =
          current.length > 0 ? current[current.length - 1] : myPos;
        if (
          !posEqual(cell, lastPos) &&
          !isBlockedCell(cell, obstacles) &&
          isValidMove(lastPos, cell) &&
          current.length < pathPoints
        ) {
          const nextPath = [...current, cell];
          playPathStepSfx();
          setMyPath(nextPath);
        }
      } else if (dragState.current.fromPiece) {
        // Add mode
        addToPath(cell);
      }
    },
    [
      canEditPath,
      myPos,
      responsiveCellSize,
      addToPath,
      removeFromPath,
      obstacles,
      pathPoints,
      playPathStepSfx,
      setMyPath,
    ],
  );

  const handlePointerEnd = useCallback(
    (e?: React.PointerEvent<HTMLDivElement>) => {
      if (e?.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      const shouldSubmitTutorialPath =
        tutorialAutoSubmit &&
        isPlanning &&
        !!roundInfo &&
        roundInfo.timeLimit <= 0 &&
        !!myColor &&
        !!gameState &&
        !gameState.players[myColor].pathSubmitted &&
        useGameStore.getState().myPath.length > 0;
      setHoveredCell(null);
      dragState.current = { active: false, fromPiece: false, fromEnd: false };
      if (shouldSubmitTutorialPath) {
        window.setTimeout(() => submitCurrentPath(), 0);
      }
    },
    [
      gameState,
      isPlanning,
      myColor,
      roundInfo,
      submitCurrentPath,
      tutorialAutoSubmit,
    ],
  );

  // Keyboard handler
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (!canEditPath || !myPos) return;
      // Don't handle if chat is focused
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (!keyboardControls.keyboardEnabled && e.isTrusted) return;

      const dirs: Record<string, Position> = {
        ArrowUp: { row: -1, col: 0 },
        ArrowDown: { row: 1, col: 0 },
        ArrowLeft: { row: 0, col: -1 },
        ArrowRight: { row: 0, col: 1 },
      };
      const dir = dirs[e.key];
      if (!dir) return;
      e.preventDefault();

      const current = useGameStore.getState().myPath;
      const lastPos = current.length > 0 ? current[current.length - 1] : myPos;
      const next: Position = {
        row: lastPos.row + dir.row,
        col: lastPos.col + dir.col,
      };
      if (next.row < 0 || next.row > 4 || next.col < 0 || next.col > 4) return;
      if (isBlockedCell(next, obstacles)) return;

      if (current.length > 0) {
        const secondLast =
          current.length >= 2 ? current[current.length - 2] : myPos;
        if (posEqual(next, secondLast)) {
          removeFromPath();
          return;
        }
      }

      if (current.length >= pathPoints) return;
      if (isValidMove(lastPos, next)) {
        const nextPath = [...current, next];
        playPathStepSfx();
        setMyPath(nextPath);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [
    canEditPath,
    keyboardControls.keyboardEnabled,
    myPos,
    obstacles,
    pathPoints,
    playPathStepSfx,
    removeFromPath,
    setMyPath,
  ]);

  useEffect(() => {
    if (!controllerControls.controllerEnabled) return;
    if (!canEditPath || !myPos) return;

    let raf = 0;
    let lastInput = "";
    let lastInputAt = 0;

    const getDirection = (gamepad: Gamepad) => {
      if (gamepad.buttons[12]?.pressed) return "ArrowUp";
      if (gamepad.buttons[13]?.pressed) return "ArrowDown";
      if (gamepad.buttons[14]?.pressed) return "ArrowLeft";
      if (gamepad.buttons[15]?.pressed) return "ArrowRight";

      const horizontal = gamepad.axes[0] ?? 0;
      const vertical = gamepad.axes[1] ?? 0;
      if (Math.abs(horizontal) > Math.abs(vertical)) {
        if (horizontal <= -0.55) return "ArrowLeft";
        if (horizontal >= 0.55) return "ArrowRight";
      }
      if (vertical <= -0.55) return "ArrowUp";
      if (vertical >= 0.55) return "ArrowDown";
      return "";
    };

    const emitKey = (key: string, code = key) => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key, code }));
    };

    const pollController = () => {
      const gamepad = navigator.getGamepads().find(Boolean);
      if (gamepad) {
        const direction = getDirection(gamepad);
        const buttonCode = gamepad.buttons[
          controllerControls.gameActionButton
        ]?.pressed
          ? "gameAction"
          : gamepad.buttons[controllerControls.selectActionButton]?.pressed
            ? "selectAction"
            : "";
        const input = direction || buttonCode;
        const now = performance.now();

        if (!input) {
          lastInput = "";
        } else {
          const delay =
            input === lastInput
              ? input.startsWith("Arrow")
                ? 160
                : Number.POSITIVE_INFINITY
              : 0;
          if (input !== lastInput || now - lastInputAt >= delay) {
            lastInput = input;
            lastInputAt = now;

            if (direction) {
              emitKey(direction);
            } else if (buttonCode === "gameAction") {
              emitKey("", keyboardControls.gameActionKey);
            } else if (buttonCode === "selectAction") {
              emitKey("", keyboardControls.selectActionKey);
            }
          }
        }
      }

      raf = window.requestAnimationFrame(pollController);
    };

    raf = window.requestAnimationFrame(pollController);
    return () => window.cancelAnimationFrame(raf);
  }, [
    controllerControls,
    canEditPath,
    keyboardControls.gameActionKey,
    keyboardControls.selectActionKey,
    myPos,
  ]);

  // Submit once when the planning timer ends, even if the path is partial.
  useEffect(() => {
    if (!isPlanning || !myColor || !roundInfo || !gameState) return;
    if (roundInfo.timeLimit <= 0) return;
    if (gameState.players[myColor].pathSubmitted) return;

    const submitAtMs = roundInfo.roundEndsAt;
    const preSubmitDelayMs = Math.max(
      0,
      submitAtMs - getEstimatedServerNow() - PRE_SUBMIT_LEAD_MS,
    );
    const finalSubmitDelayMs = Math.max(
      0,
      submitAtMs - getEstimatedServerNow(),
    );

    const preSubmitTimeoutId = window.setTimeout(() => {
      submitCurrentPath();
    }, preSubmitDelayMs);
    const finalSubmitTimeoutId = window.setTimeout(() => {
      submitCurrentPath();
    }, finalSubmitDelayMs);

    return () => {
      window.clearTimeout(preSubmitTimeoutId);
      window.clearTimeout(finalSubmitTimeoutId);
    };
  }, [gameState, isPlanning, myColor, roundInfo, submitCurrentPath]);

  const cells = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => ({
    row: Math.floor(i / GRID_SIZE),
    col: i % GRID_SIZE,
  }));

  const opponentColor = myColor === "red" ? "blue" : "red";
  const animation = useGameStore.getState().animation;
  const isPlaybackPhase =
    gameState?.phase === "moving" || gameState?.phase === "gameover";
  const fullRedPath = isPlaybackPhase
    ? (animation?.redPath ?? [])
    : myColor === "red"
      ? myPath
      : [];
  const fullBluePath = isPlaybackPhase
    ? (animation?.bluePath ?? [])
    : myColor === "blue"
      ? myPath
      : [];

  useEffect(() => {
    const previousPhase = previousPhaseRef.current;
    previousPhaseRef.current = gameState?.phase ?? null;

    if (gameState?.phase !== "moving" || previousPhase === "moving") return;
    if (!animation || !myColor) return;

    const opponentFullPath =
      opponentColor === "red"
        ? (animation.redPath ?? [])
        : (animation.bluePath ?? []);
    if (opponentFullPath.length === 0) return;

    setOpponentRevealToken((prev) => prev + 1);
  }, [animation, gameState?.phase, myColor, opponentColor]);

  const revealedRedPath = fullRedPath;
  const revealedBluePath = fullBluePath;

  return (
    <div ref={shellRef} className="game-grid-shell">
      <div
        ref={gridRef}
        className={`game-grid ${boardSkinClass}`}
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
              hoveredCell?.row === row && hoveredCell?.col === col
                ? "is-hovered"
                : ""
            }`}
            style={getCellStyle(
              row,
              col,
              isBlockedCell({ row, col }, obstacles),
            )}
          >
            {isBlockedCell({ row, col }, obstacles) && (
              <div className="obstacle-mark" />
            )}
          </div>
        ))}

        {tutorialGuideSvgPath && (
          <>
            <svg
              className="tutorial-finger-path"
              width="100%"
              height="100%"
              viewBox={`0 0 ${boardSize} ${boardSize}`}
              aria-hidden="true"
            >
              <path d={tutorialGuideSvgPath} />
            </svg>
            <span
              className="tutorial-finger-guide"
              aria-hidden="true"
              style={
                {
                  offsetPath: `path("${tutorialGuideSvgPath}")`,
                  WebkitOffsetPath: `path("${tutorialGuideSvgPath}")`,
                } as CSSProperties
              }
            >
              👆
            </span>
          </>
        )}

        {/* Path lines: red behind (lower z-index, thicker), blue on top */}
        <PathLine
          key={
            myColor === "blue"
              ? `red-opponent-${opponentRevealToken}`
              : "red-self"
          }
          color="red"
          path={revealedRedPath}
          startPos={
            isPlaybackPhase
              ? (animation?.redStart ??
                gameState?.players.red.position ??
                redDisplayPos)
              : (gameState?.players.red.position ?? redDisplayPos)
          }
          cellSize={responsiveCellSize}
          isPlanning={isPlanning}
          animateReveal={isPlaybackPhase && myColor === "blue"}
        />
        <PathLine
          key={
            myColor === "red"
              ? `blue-opponent-${opponentRevealToken}`
              : "blue-self"
          }
          color="blue"
          path={revealedBluePath}
          startPos={
            isPlaybackPhase
              ? (animation?.blueStart ??
                gameState?.players.blue.position ??
                blueDisplayPos)
              : (gameState?.players.blue.position ?? blueDisplayPos)
          }
          cellSize={responsiveCellSize}
          isPlanning={isPlanning}
          animateReveal={isPlaybackPhase && myColor === "red"}
        />

        {/* Collision effects */}
        {collisionEffects.map(({ id, position }) => (
          <CollisionEffect
            key={id}
            position={position}
            cellSize={responsiveCellSize}
          />
        ))}

        {/* Pieces */}
        {(gameState?.players.red.hp ?? 0) > 0 ||
        hitEffect.red ||
        explosionEffect === "red" ? (
          <PlayerPiece
            color="red"
            position={redDisplayPos}
            cellSize={responsiveCellSize}
            isAttacker={gameState?.attackerColor === "red"}
            isHit={hitEffect.red}
            isExploding={explosionEffect === "red"}
            isMe={myColor === "red"}
            isOverloaded={
              myColor !== "red" && gameState?.players.red.connected === false
            }
            entranceAnimation={entranceAnimation ? "left" : null}
            hp={gameState?.players.red.hp ?? 3}
            maxHp={3}
            skin={redPieceSkin}
          />
        ) : null}
        {(gameState?.players.blue.hp ?? 0) > 0 ||
        hitEffect.blue ||
        explosionEffect === "blue" ? (
          <PlayerPiece
            color="blue"
            position={blueDisplayPos}
            cellSize={responsiveCellSize}
            isAttacker={gameState?.attackerColor === "blue"}
            isHit={hitEffect.blue}
            isExploding={explosionEffect === "blue"}
            isMe={myColor === "blue"}
            isOverloaded={
              myColor !== "blue" && gameState?.players.blue.connected === false
            }
            entranceAnimation={entranceAnimation ? "right" : null}
            hp={gameState?.players.blue.hp ?? 3}
            maxHp={3}
            skin={bluePieceSkin}
          />
        ) : null}

        {tutorialHint && tutorialHintCentered && (
          <div
            className="ai-tutorial-hint in-grid no-arrow"
            style={{
              left: boardSize / 2,
              top: tutorialHintBottom
                ? boardSize - responsiveCellSize * 0.75
                : boardSize / 4,
              transform: "translate(-50%, -50%)",
              animation: tutorialHintBottom
                ? "tutorial-hint-in-for-ten 0.22s ease-out"
                : undefined,
            }}
          >
            {tutorialHint}
          </div>
        )}

        {tutorialHint && !tutorialHintCentered && tutorialAnchorPos && (
          <div
            className={`ai-tutorial-hint in-grid${tutorialHintTarget === "opponent" ? " is-mirrored" : ""}${tutorialHintAbove ? " arrow-down" : ""}`}
            style={{
              left:
                tutorialAnchorPos.col * responsiveCellSize +
                responsiveCellSize / 2,
              top:
                tutorialAnchorPos.row * responsiveCellSize +
                (tutorialHintAbove ? -12 : responsiveCellSize + 12),
              transform: tutorialHintAbove
                ? `translateX(${tutorialHintTarget === "opponent" ? "-95%" : "-5%"}) translateY(-100%)`
                : undefined,
              ["--tutorial-arrow-left" as string]: tutorialHintAbove
                ? tutorialHintTarget === "opponent"
                  ? "95%"
                  : "5%"
                : undefined,
              // animation: tutorialHintBottom
              //   ? "tutorial-hint-in-for-ten 0.22s ease-out"
              //   : undefined,
              animation: tutorialHintAbove
                ? "tutorial-hint-in-for-nine 0.22s ease-out"
                : undefined,
              // animation: "tutorial-hint-in-for-ten 0.22s ease-out",
            }}
          >
            {tutorialHint}
          </div>
        )}
      </div>
    </div>
  );
}
