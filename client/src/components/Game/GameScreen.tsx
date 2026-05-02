import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useCallback } from "react";
import { getSocket } from "../../socket/socketClient";
import { registerSocketHandlers } from "../../socket/socketHandlers";
import { useGameStore } from "../../store/gameStore";
import { useLang } from "../../hooks/useLang";
import { getArenaFromRating } from "../../data/arenaCatalog";
import { GameGrid } from "./GameGrid";
import { GameOverOverlay } from "./GameOverOverlay";
import { PlayerInfo } from "./PlayerInfo";
import { TimerBar } from "./TimerBar";
import type { BoardSkin, ClientGameState, PlayerColor, Position } from "../../types/game.types";
import {
  playMatchResultSfx,
  startMatchResultBgm,
  stopMatchResultBgm,
} from "../../utils/soundUtils";
import {
  CONTROLS_SETTINGS_CHANGED_EVENT,
  loadControllerControlsSettings,
  loadKeyboardControlsSettings,
} from "../../settings/controls";
import "./GameScreen.css";
import "../Ability/AbilityScreen.css";

interface Props {
  onLeaveToLobby: () => void;
}

const MIN_CELL = 52;
const MAX_CELL = 160;
// 태블릿 game 모드 app-inner max-width와 맞춤 — window.innerWidth 대신 이 값으로 초기값 계산
const CONTAINER_MAX_WIDTH = 600;
const AI_TUTORIAL_SEEN_KEY = "pathclash.aiTutorialSeen.v1";
type TutorialStep =
  | 0
  | 1
  | 2
  | 3
  | 4
  | 5
  | 6
  | 7
  | 8
  | 9
  | 10
  | 11
  | 12
  | 13
  | 14;

function buildTutorialGuidePath(
  start: Position,
  end: Position,
  obstacles: Position[],
): Position[] {
  const key = (position: Position) => `${position.row},${position.col}`;
  const blocked = new Set(obstacles.map(key));
  const queue: Position[] = [{ ...start }];
  const visited = new Set([key(start)]);
  const prev = new Map<string, Position | null>();
  prev.set(key(start), null);
  const dirs = [
    { row: -1, col: 0 },
    { row: 1, col: 0 },
    { row: 0, col: -1 },
    { row: 0, col: 1 },
  ];

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.row === end.row && current.col === end.col) {
      const path: Position[] = [];
      let cursor: Position | null = current;
      while (cursor) {
        path.push(cursor);
        cursor = prev.get(key(cursor)) ?? null;
      }
      return path.reverse();
    }

    for (const dir of dirs) {
      const next = {
        row: current.row + dir.row,
        col: current.col + dir.col,
      };
      if (next.row < 0 || next.row >= 5 || next.col < 0 || next.col >= 5) {
        continue;
      }
      const nextKey = key(next);
      if (visited.has(nextKey) || blocked.has(nextKey)) continue;
      visited.add(nextKey);
      prev.set(nextKey, current);
      queue.push(next);
    }
  }

  return [start, end];
}

function computeInitialCellSize(): number {
  // window.innerWidth가 아닌 컨테이너 제약(520px)을 기준으로 초기값 계산
  // 태블릿에서 scale이 폰보다 크게 시작되는 것을 방지
  const cappedW = Math.min(window.innerWidth, CONTAINER_MAX_WIDTH);
  const availW = Math.max(260, cappedW - 24);
  return Math.max(MIN_CELL, Math.min(MAX_CELL, availW / 5));
}

function useAdaptiveCellSize(
  gridAreaRef: React.RefObject<HTMLDivElement | null>,
) {
  const [cellSize, setCellSize] = useState(computeInitialCellSize);

  useEffect(() => {
    const el = gridAreaRef.current;
    if (!el) return;

    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      const squareSide = Math.min(width, height > 60 ? height : width);
      const next = Math.max(MIN_CELL, Math.min(MAX_CELL, squareSide / 5));
      setCellSize(next);
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [gridAreaRef]);

  return cellSize;
}

function getRoleIcon(role: "attacker" | "escaper") {
  return role === "attacker" ? "ATK" : "RUN";
}

function TutorialRole({
  type,
  children,
}: {
  type: "attack" | "escape";
  children: ReactNode;
}) {
  return (
    <span
      className={
        type === "attack" ? "tutorial-role-attack" : "tutorial-role-escape"
      }
    >
      {children}
    </span>
  );
}

export function GameScreen({ onLeaveToLobby }: Props) {
  const {
    gameState,
    myColor,
    roundInfo,
    winner,
    myPath,
    gameOverMessage,
    rematchRequestSent,
    setRematchRequestSent,
    currentMatchType,
    accountDailyRewardTokens,
    boardSkin,
    currentRating,
    isSfxMuted,
    sfxVolume,
  } = useGameStore();
  const { t, lang } = useLang();
  const gridAreaRef = useRef<HTMLDivElement>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const selfRoleBadgeRef = useRef<HTMLDivElement>(null);
  const pathBarRef = useRef<HTMLDivElement>(null);
  const cellSize = useAdaptiveCellSize(gridAreaRef);
  const [tutorialStep, setTutorialStep] = useState<TutorialStep>(0);
  const [roleTutorialPos, setRoleTutorialPos] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [pathBarTutorialPos, setPathBarTutorialPos] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [showEntranceAnimation, setShowEntranceAnimation] = useState(true);
  const [keyboardControls, setKeyboardControls] = useState(
    loadKeyboardControlsSettings,
  );
  const [controllerControls, setControllerControls] = useState(
    loadControllerControlsSettings,
  );
  const tutorialStartedRef = useRef(false);
  const resultAudioPlayedRef = useRef(false);
  const [connStatus, setConnStatus] = useState<"connected" | "reconnecting" | "failed">("connected");

  useEffect(() => {
    const socket = getSocket();
    const cleanup = registerSocketHandlers(socket);
    socket.emit("game_client_ready");
    return cleanup;
  }, []);

  useEffect(() => {
    const socket = getSocket();

    const handleDisconnect = () => {
      setConnStatus("reconnecting");
    };

    const handleConnect = () => {
      const { authAccessToken, myNickname } = useGameStore.getState();
      socket.emit("rejoin_game", { accessToken: authAccessToken, nickname: myNickname });
    };

    const handleRejoinAck = (payload: {
      mode: string;
      color: PlayerColor;
      roomCode: string;
      gameState?: ClientGameState;
    }) => {
      if (payload.mode !== "base") return;
      const store = useGameStore.getState();
      store.setMyColor(payload.color);
      store.setRoomCode(payload.roomCode);
      if (payload.gameState) store.setGameState(payload.gameState);
      setConnStatus("connected");
      socket.emit("game_client_ready");
    };

    const handleRejoinNotFound = () => {
      setConnStatus("failed");
      setTimeout(onLeaveToLobby, 1500);
    };

    socket.on("disconnect", handleDisconnect);
    socket.on("connect", handleConnect);
    socket.on("rejoin_ack", handleRejoinAck);
    socket.on("rejoin_not_found", handleRejoinNotFound);

    return () => {
      socket.off("disconnect", handleDisconnect);
      socket.off("connect", handleConnect);
      socket.off("rejoin_ack", handleRejoinAck);
      socket.off("rejoin_not_found", handleRejoinNotFound);
    };
  }, [onLeaveToLobby]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
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

  useEffect(() => {
    setShowEntranceAnimation(true);
    const timeout = window.setTimeout(() => {
      setShowEntranceAnimation(false);
    }, 620);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!winner || !myColor) {
      resultAudioPlayedRef.current = false;
      stopMatchResultBgm();
      return;
    }

    if (resultAudioPlayedRef.current) return;

    const didWin = winner === myColor;
    if (!isSfxMuted) {
      playMatchResultSfx(didWin ? "victory" : "defeat", sfxVolume);
    }
    startMatchResultBgm(didWin ? "victory" : "defeat");
    resultAudioPlayedRef.current = true;
  }, [isSfxMuted, myColor, sfxVolume, winner]);

  useEffect(() => {
    return () => {
      stopMatchResultBgm();
    };
  }, []);

  useEffect(() => {
    if (currentMatchType !== "ai" || !gameState?.tutorialActive) {
      setTutorialStep(0);
      return;
    }

    const hasSeenTutorial =
      window.localStorage.getItem(AI_TUTORIAL_SEEN_KEY) === "1";
    setTutorialStep(hasSeenTutorial ? 0 : 1);
  }, [currentMatchType, gameState?.tutorialActive]);

  useEffect(() => {
    if (tutorialStep !== 2) {
      setRoleTutorialPos(null);
      return;
    }

    const updateRoleTutorialPosition = () => {
      const screenEl = screenRef.current;
      const badgeEl = selfRoleBadgeRef.current;
      if (!screenEl || !badgeEl) {
        setRoleTutorialPos(null);
        return;
      }

      const screenRect = screenEl.getBoundingClientRect();
      const badgeRect = badgeEl.getBoundingClientRect();
      setRoleTutorialPos({
        left: badgeRect.left - screenRect.left,
        top: badgeRect.top - screenRect.top - 8,
      });
    };

    updateRoleTutorialPosition();
    window.addEventListener("resize", updateRoleTutorialPosition);
    return () =>
      window.removeEventListener("resize", updateRoleTutorialPosition);
  }, [tutorialStep, gameState, myColor]);

  useEffect(() => {
    if (tutorialStep !== 5) {
      setPathBarTutorialPos(null);
      return;
    }

    const updatePathBarPos = () => {
      const screenEl = screenRef.current;
      const barEl = pathBarRef.current;
      if (!screenEl || !barEl) {
        setPathBarTutorialPos(null);
        return;
      }

      const screenRect = screenEl.getBoundingClientRect();
      const barRect = barEl.getBoundingClientRect();
      setPathBarTutorialPos({
        left: barRect.left - screenRect.left + barRect.width / 2,
        top: barRect.top - screenRect.top - 8,
      });
    };

    updatePathBarPos();
    window.addEventListener("resize", updatePathBarPos);
    return () => window.removeEventListener("resize", updatePathBarPos);
  }, [tutorialStep]);

  useEffect(() => {
    if (tutorialStep === 0) return;

    const dismissTutorialHint = () => {
      if (tutorialStep === 1) {
        setTutorialStep(2);
        return;
      }
      if (tutorialStep === 2) {
        setTutorialStep(3);
        return;
      }
      if (tutorialStep === 3) {
        setTutorialStep(4);
        return;
      }
      if (tutorialStep === 4) {
        setTutorialStep(5);
        return;
      }
      if (tutorialStep === 5) {
        setTutorialStep(6);
        return;
      }
      if (tutorialStep === 6) {
        setTutorialStep(7);
        return;
      }
    };

    window.addEventListener("pointerdown", dismissTutorialHint, true);
    return () =>
      window.removeEventListener("pointerdown", dismissTutorialHint, true);
  }, [tutorialStep]);

  useEffect(() => {
    if (
      currentMatchType !== "ai" ||
      tutorialStep !== 7 ||
      tutorialStartedRef.current
    ) {
      return;
    }
    tutorialStartedRef.current = true;
    getSocket().emit("resume_tutorial");
  }, [currentMatchType, tutorialStep]);

  useEffect(() => {
    if (currentMatchType !== "ai" || !roundInfo?.tutorialScenario) return;
    if (roundInfo.tutorialScenario === "escape" && tutorialStep < 8) {
      setTutorialStep(8);
      return;
    }
    if (roundInfo.tutorialScenario === "predict" && tutorialStep < 9) {
      setTutorialStep(9);
      return;
    }
    if (
      roundInfo.tutorialScenario === "predict_obstacle" &&
      tutorialStep < 10
    ) {
      setTutorialStep(10);
      return;
    }
    if (roundInfo.tutorialScenario === "predict_wall" && tutorialStep < 11) {
      setTutorialStep(11);
      return;
    }
    if (roundInfo.tutorialScenario === "overlap_escape" && tutorialStep < 12) {
      setTutorialStep(12);
      return;
    }
    if (roundInfo.tutorialScenario === "chain_attack" && tutorialStep < 13) {
      setTutorialStep(13);
      return;
    }
    if (
      roundInfo.tutorialScenario === "freeplay" &&
      tutorialStep !== 0 &&
      tutorialStep < 14
    ) {
      setTutorialStep(14);
      return;
    }
    if (roundInfo.tutorialScenario === "chain_attack" && tutorialStep === 14) {
      setTutorialStep(13);
      return;
    }
    if (roundInfo.tutorialScenario === "freeplay" && tutorialStep === 13) {
      setTutorialStep(14);
      return;
    }
    if (
      roundInfo.tutorialScenario === "freeplay" &&
      tutorialStep !== 0 &&
      tutorialStep < 14
    ) {
      setTutorialStep(14);
      return;
    }
    if (
      roundInfo.tutorialScenario === "predict_obstacle" &&
      tutorialStep === 11
    ) {
      setTutorialStep(10);
      return;
    }
    if (roundInfo.tutorialScenario === "predict_wall" && tutorialStep === 12) {
      setTutorialStep(11);
      return;
    }
    if (
      roundInfo.tutorialScenario === "overlap_escape" &&
      tutorialStep === 13
    ) {
      setTutorialStep(12);
      return;
    }
  }, [currentMatchType, roundInfo?.tutorialScenario, tutorialStep]);

  useEffect(() => {
    if (
      currentMatchType !== "ai" ||
      tutorialStep === 0 ||
      !winner ||
      !myColor ||
      winner !== myColor
    ) {
      return;
    }
    window.localStorage.setItem(AI_TUTORIAL_SEEN_KEY, "1");
    setTutorialStep(0);
  }, [currentMatchType, myColor, tutorialStep, winner]);

  const handleGameAction = useCallback(() => {
    if (
      winner &&
      (currentMatchType === "ai" || currentMatchType === "friend") &&
      !gameOverMessage &&
      !rematchRequestSent
    ) {
      getSocket().emit("request_rematch");
      setRematchRequestSent(true);
      return;
    }

    onLeaveToLobby();
  }, [
    currentMatchType,
    gameOverMessage,
    onLeaveToLobby,
    rematchRequestSent,
    setRematchRequestSent,
    winner,
  ]);

  useEffect(() => {
    const isTypingTarget = () => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return false;
      return (
        active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.tagName === "SELECT" ||
        active.isContentEditable
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget()) return;

      if (event.key === "Escape") {
        event.preventDefault();
        onLeaveToLobby();
        return;
      }

      if (event.code === keyboardControls.gameActionKey) {
        if (!winner && !keyboardControls.keyboardEnabled && event.isTrusted) {
          return;
        }
        event.preventDefault();
        handleGameAction();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [
    gameOverMessage,
    handleGameAction,
    keyboardControls.gameActionKey,
    keyboardControls.keyboardEnabled,
    onLeaveToLobby,
    winner,
  ]);

  useEffect(() => {
    if (!winner || !controllerControls.controllerEnabled) return;

    let raf = 0;
    let wasPressed = false;

    const pollControllerExit = () => {
      const gamepad = navigator.getGamepads().find(Boolean);
      const isPressed =
        gamepad?.buttons[controllerControls.gameActionButton]?.pressed === true;

      if (isPressed && !wasPressed) {
        handleGameAction();
        return;
      }

      wasPressed = isPressed;
      raf = window.requestAnimationFrame(pollControllerExit);
    };

    raf = window.requestAnimationFrame(pollControllerExit);
    return () => window.cancelAnimationFrame(raf);
  }, [
    controllerControls.controllerEnabled,
    controllerControls.gameActionButton,
    handleGameAction,
    onLeaveToLobby,
    winner,
  ]);

  if (!gameState) {
    return <div className="gs-loading">{t.loading}</div>;
  }

  const opponentColor = myColor === "red" ? "blue" : "red";
  const me = myColor ? gameState.players[myColor] : null;
  const opponent = gameState.players[opponentColor];
  const tutorialInProgress = currentMatchType === "ai" && tutorialStep !== 0;
  const tutorialHintAnchor = useMemo(() => {
    if (!myColor || !roundInfo) return null;
    if (
      tutorialStep === 7 ||
      tutorialStep === 8 ||
      tutorialStep === 9 ||
      tutorialStep === 10 ||
      tutorialStep === 11
    ) {
      return myColor === "red" ? roundInfo.redPosition : roundInfo.bluePosition;
    }
    return null;
  }, [myColor, roundInfo, tutorialStep]);
  const tutorialGuidePath = useMemo(() => {
    if (!myColor || !me || gameState.phase !== "planning") {
      return null;
    }
    const start = gameState.players[myColor].position;
    if (tutorialStep === 7) {
      const end = gameState.players[opponentColor].position;
      const alreadyReached = myPath.some(
        (position) => position.row === end.row && position.col === end.col,
      );
      if (alreadyReached) return null;
      return buildTutorialGuidePath(start, end, gameState.obstacles);
    }

    if (tutorialStep !== 8) {
      if (tutorialStep !== 13) {
        return null;
      }

      const guidePath = [
        start,
        { row: Math.max(0, start.row - 1), col: start.col },
        { row: Math.max(0, start.row - 1), col: Math.max(0, start.col - 1) },
        { row: start.row, col: Math.max(0, start.col - 1) },
        { row: start.row, col: Math.max(0, start.col - 2) },
        { row: Math.min(4, start.row + 1), col: Math.max(0, start.col - 2) },
      ];
      const last = guidePath[guidePath.length - 1];
      const alreadyReached =
        myPath.length >= guidePath.length - 1 &&
        myPath[myPath.length - 1]?.row === last.row &&
        myPath[myPath.length - 1]?.col === last.col;
      return alreadyReached ? null : guidePath;
    }

    const end = {
      row: Math.max(0, start.row - 2),
      col: start.col,
    };
    const alreadyReached =
      myPath.length >= 2 &&
      myPath[myPath.length - 1]?.row === end.row &&
      myPath[myPath.length - 1]?.col === end.col;
    if (alreadyReached) return null;
    return buildTutorialGuidePath(start, end, gameState.obstacles);
  }, [
    gameState.obstacles,
    gameState.phase,
    gameState.players,
    me,
    myColor,
    myPath,
    opponentColor,
    tutorialStep,
  ]);
  const dailyRewardRemaining = Math.max(0, 120 - accountDailyRewardTokens);
  const winRewardTokens =
    winner && myColor && winner === myColor && currentMatchType === "random"
      ? Math.min(6, dailyRewardRemaining)
      : null;
  const tutorialRematchAllowed =
    currentMatchType !== "ai" || !roundInfo?.tutorialScenario;
  const useLobbyResultAction =
    currentMatchType === "friend" || currentMatchType === "random";
  const showFriendRematchAction = currentMatchType === "friend";
  const resolvedBoardSkin: BoardSkin = (() => {
    if (gameState?.tutorialActive) return "classic";
    const redBoardSkin = gameState?.players.red.boardSkin;
    const blueBoardSkin = gameState?.players.blue.boardSkin;
    if (redBoardSkin && redBoardSkin !== "classic") return redBoardSkin;
    if (blueBoardSkin && blueBoardSkin !== "classic") return blueBoardSkin;
    return boardSkin;
  })();
  const currentArena = getArenaFromRating(currentRating);
  const screenBoardClass =
    currentArena > 1
      ? `arena-bg-${currentArena}-screen`
      : resolvedBoardSkin === "pharaoh"
      ? "board-bg-pharaoh-screen"
      : resolvedBoardSkin === "magic"
        ? "board-bg-magic-screen"
        : "";
  const gridTutorialHint = (() => {
    if (tutorialStep === 3) {
      return lang === "en" ? (
        <>
          As the <TutorialRole type="attack">attacker</TutorialRole>, you can
          deal damage by colliding with the opponent.
        </>
      ) : (
        <>
          <TutorialRole type="attack">공격</TutorialRole> 역할일 때는 상대 말과
          충돌하면 피해를 입힐 수 있습니다.
        </>
      );
    }

    if (tutorialStep === 4) {
      return lang === "en" ? (
        <>
          On the other hand, the{" "}
          <TutorialRole type="escape">escaper</TutorialRole> must predict the
          attacker's path and plan an escape route.
        </>
      ) : (
        <>
          반면, <TutorialRole type="escape">도망</TutorialRole> 역할은 상대의
          공격 경로를 예측하여 도주 경로를 짜야 합니다.
        </>
      );
    }

    if (tutorialStep === 7) {
      return lang === "en" ? (
        <>
          Let's begin the game.
          <br />
          You are the <TutorialRole type="attack">attacker</TutorialRole> this
          round.
          <br />
          Draw a path to attack the opponent.
        </>
      ) : (
        <>
          이제 게임을 시작하겠습니다.
          <br />
          이번 라운드에서 당신의 역할은{" "}
          <TutorialRole type="attack">공격</TutorialRole>입니다.
          <br />
          경로를 그려 상대를 공격하세요.
        </>
      );
    }

    if (tutorialStep === 8) {
      return lang === "en" ? (
        <>
          Well done! Here's the next situation.
          <br />
          You are the <TutorialRole type="escape">escaper</TutorialRole> this
          round.
          <br />
          Predict the opponent's attack path. Move two cells upward to avoid
          damage.
        </>
      ) : (
        <>
          잘했습니다! 다음 상황입니다.
          <br />
          이번 라운드에서 당신의 역할은{" "}
          <TutorialRole type="escape">도망</TutorialRole>입니다.
          <br />
          상대의 공격 경로를 예측하세요. 피해를 피하려면 위로 두 칸 이동하세요.
        </>
      );
    }

    if (tutorialStep === 9 || tutorialStep === 11) {
      return lang === "en" ? (
        <>
          Good Job! Here's the next situation.
          <br />
          You are the <TutorialRole type="attack">attacker</TutorialRole> this
          round.
          <br />
          Predict the opponent's escape path and attack them.
        </>
      ) : (
        <>
          잘했습니다! 다음 상황입니다.
          <br />
          이번 라운드에서 당신의 역할은{" "}
          <TutorialRole type="attack">공격</TutorialRole>입니다.
          <br />
          상대의 도주 경로를 예측하여 공격하세요.
        </>
      );
    }

    if (tutorialStep === 10) {
      return lang === "en" ? (
        <>
          Nice! We've added barriers, which you can't pass through.
          <br />
          You are the <TutorialRole type="attack">attacker</TutorialRole> this
          round.
          <br />
          Predict the opponent's escape path and attack them.
        </>
      ) : (
        <>
          좋습니다! 지나갈 수 없는 장애물이 추가되었습니다.
          <br />
          이번 라운드에서 당신의 역할은{" "}
          <TutorialRole type="attack">공격</TutorialRole>입니다.
          <br />
          상대의 도주 경로를 예측하여 공격하세요.
        </>
      );
    }

    if (tutorialStep === 12) {
      return lang === "en" ? (
        <>
          Well done! This time, you and the opponent are overlapping.
          <br />
          You are the <TutorialRole type="escape">escaper</TutorialRole> this
          round.
          <br />
          If you stay still while overlapping, you will definitely get hit.
          <br />
          Try to choose a direction that does not overlap with the opponent's
          path and escape.
        </>
      ) : (
        <>
          잘했습니다! 이번엔 말이 겹쳐진 상태입니다.
          <br />
          이번 라운드에서 당신의 역할은{" "}
          <TutorialRole type="escape">도망</TutorialRole>입니다.
          <br />
          겹쳐진 상태에서 가만히 있으면 반드시 공격을 받습니다.
          <br />
          상대의 이동 경로와 겹치지 않는 방향을 골라 도망가세요!
        </>
      );
    }

    if (tutorialStep === 13) {
      return lang === "en" ? (
        <>
          Good Job!
          <br />
          This is the final situation!
          <br />
          In PathClash, repeated collisions occur when paths overlap.
          <br />
          You are the <TutorialRole type="attack">attacker</TutorialRole> this
          round.
          <br />
          Predict the opponent's path and deal 3 or more consecutive damage in a
          single round!
        </>
      ) : (
        <>
          잘했습니다! 이번엔 마지막 상황입니다!
          <br />
          PathClash에서는 경로가 겹칠 경우, 연속 충돌 판정이 일어납니다.
          <br />
          당신의 역할은 <TutorialRole type="attack">공격</TutorialRole>입니다.
          <br />
          상대의 경로를 예측하여, 상대에게 3 이상의 연속 피해를 입히세요!
        </>
      );
    }

    return null;
  })();

  return (
    <div
      className={`game-screen ability-screen standard-battle-screen ${screenBoardClass}`}
      ref={screenRef}
    >
      {connStatus !== "connected" && (
        <div className="gs-reconnecting-overlay">
          <span className="gs-reconnecting-spinner" />
          <span>
            {connStatus === "reconnecting" ? (lang === "en" ? "Reconnecting…" : "재연결 중…") : (lang === "en" ? "Connection failed" : "연결 실패")}
          </span>
        </div>
      )}
      <div className="gs-utility-bar">
        <div className="gs-timer-slot">
          {gameState.phase === "planning" &&
            roundInfo &&
            !tutorialInProgress && (
              <TimerBar
                duration={roundInfo.timeLimit}
                roundEndsAt={roundInfo.roundEndsAt}
              />
            )}
          {gameState.phase === "moving" && (
            <div className="gs-phase-moving">
              <span className="gs-moving-pip" />
              {t.moving}
            </div>
          )}
        </div>
        <div className="gs-utility-buttons">
          <button className="gs-lobby-btn" onClick={onLeaveToLobby}>
            Lobby
          </button>
        </div>
      </div>

      <div className="gs-board-stage">
        {winner && (
          <div className="gs-result-slot">
            <GameOverOverlay
              winner={winner}
              myColor={myColor!}
              rewardTokens={winRewardTokens}
              allowRematch={tutorialRematchAllowed}
              actionLabel={
                useLobbyResultAction ? (lang === "en" ? "LOBBY" : "로비") : null
              }
              onAction={useLobbyResultAction ? onLeaveToLobby : null}
              alignActionRight={useLobbyResultAction}
              showActionWithRematch={showFriendRematchAction}
              rematchButtonTone={showFriendRematchAction ? "blue" : "green"}
            />
          </div>
        )}

        <div ref={pathBarRef} className="gs-path-bar ability-path-bar">
          <div
            ref={selfRoleBadgeRef}
            className={`gs-role-badge gs-role-badge-self gs-role-badge-${me?.role === "attacker" ? "atk" : "run"} ability-path-role`}
          >
            <span className="gs-role-icon">
              {getRoleIcon(me?.role ?? "escaper")}
            </span>
            <span className="gs-role-label">
              {(me?.role ?? "escaper") === "attacker"
                ? t.roleAttack
                : t.roleEscape}
            </span>
          </div>
          <div className="ability-path-points">
            <div className="gs-path-header">
              <span className="gs-path-label path-points-label-highlight">
                {t.pathPoints}
              </span>
              <span className="gs-path-count">
                <span className="gs-path-current">{myPath.length}</span>
                <span className="gs-path-sep"> / </span>
                <span className="gs-path-max">{gameState.pathPoints}</span>
              </span>
            </div>
            <div className="gs-path-gauge">
              {Array.from({ length: gameState.pathPoints }, (_, index) => (
                <div
                  key={index}
                  className={`gs-path-seg${index < myPath.length ? " filled" : ""}${index === myPath.length - 1 ? " latest" : ""}`}
                />
              ))}
            </div>
          </div>
        </div>

        <div className="ability-opponent-panel standard-opponent-panel">
          <div className="ability-opponent-panel-name">
            <span className="ability-opponent-panel-label">
              {lang === "en" ? "Opponent" : "상대"}
            </span>
            <PlayerInfo player={opponent} isMe={false} />
          </div>
        </div>

        <div className="gs-grid-area" ref={gridAreaRef}>
          <GameGrid
            entranceAnimation={showEntranceAnimation}
            cellSize={cellSize}
            tutorialHint={gridTutorialHint}
            tutorialHintTarget={tutorialStep === 4 ? "opponent" : "self"}
            tutorialHintAnchor={tutorialHintAnchor}
            tutorialHintCentered={
              tutorialStep === 10 ||
              tutorialStep === 11 ||
              tutorialStep === 12 ||
              tutorialStep === 13
            }
            tutorialHintBottom={tutorialStep === 10 || tutorialStep === 13}
            tutorialHintAbove={tutorialStep === 9}
            tutorialGuidePath={tutorialGuidePath}
            tutorialAutoSubmit={tutorialInProgress}
          />
        </div>
      </div>

      {tutorialStep === 1 && (
        <div
          className="ai-tutorial-hint no-arrow"
          style={{
            left: "50%",
            top: "42%",
            transform: "translate(-50%, -50%)",
            animation: "tutorial-hint-in-center 0.22s ease-out",
          }}
        >
          {t.introTutorialHint}
        </div>
      )}
      {tutorialStep === 2 && roleTutorialPos && (
        <div
          className="ai-tutorial-hint no-arrow"
          style={{
            left: "50%",
            top: "42%",
            transform: "translate(-50%, -50%)",
            animation: "tutorial-hint-in-center 0.22s ease-out",
          }}
        >
          {lang === "en" ? (
            <>
              Your current role is{" "}
              <TutorialRole type="attack">Attack</TutorialRole>.
              <br />
              Your role swaps every round.
            </>
          ) : (
            <>
              현재 당신의 역할은 <TutorialRole type="attack">공격</TutorialRole>
              입니다.
              <br />
              역할은 매 라운드마다 서로 바뀝니다.
            </>
          )}
        </div>
      )}
      {tutorialStep === 5 && pathBarTutorialPos && (
        <div
          className="ai-tutorial-hint no-arrow"
          style={{
            left: "50%",
            top: "42%",
            transform: "translate(-50%, -50%)",
            animation: "tutorial-hint-in-center 0.22s ease-out",
          }}
        >
          {lang === "en" ? (
            <>
              The <span className="tutorial-highlight-green">Path Points</span>{" "}
              at the top determine how many cells you can draw a path through.
              <br />
              They increase by 1 each round, up to a maximum of 10.
            </>
          ) : (
            <>
              상단에 있는{" "}
              <span className="tutorial-highlight-green">경로 포인트</span>는
              자신이 경로를 몇 칸이나 그릴 수 있는지를 나타냅니다.
              <br />매 라운드마다 1씩 증가하며, 최대 10까지 증가합니다.
            </>
          )}
        </div>
      )}
      {tutorialStep === 6 && (
        <div
          className="ai-tutorial-hint ai-tutorial-hint-center no-arrow"
          style={{
            left: "50%",
            top: "42%",
            transform: "translate(-50%, -50%)",
          }}
        >
          {t.winConditionTutorialHint}
        </div>
      )}
    </div>
  );
}
