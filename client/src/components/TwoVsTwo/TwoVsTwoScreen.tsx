import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { getSocket } from '../../socket/socketClient';
import { syncServerTime } from '../../socket/timeSync';
import { useLang } from '../../hooks/useLang';
import { useGameStore } from '../../store/gameStore';
import type { ChatMessage, Position } from '../../types/game.types';
import type {
  TwoVsTwoClientState,
  TwoVsTwoPlayerHitEvent,
  TwoVsTwoResolutionPayload,
  TwoVsTwoRoundStartPayload,
  TwoVsTwoSlot,
} from '../../types/twovtwo.types';
import {
  playMatchResultSfx,
  startMatchResultBgm,
  stopMatchResultBgm,
} from '../../utils/soundUtils';
import {
  CONTROLS_SETTINGS_CHANGED_EVENT,
  loadControllerControlsSettings,
  loadKeyboardControlsSettings,
} from '../../settings/controls';
import { TimerBar } from '../Game/TimerBar';
import { PlayerInfo } from '../Game/PlayerInfo';
import { TwoVsTwoGrid } from './TwoVsTwoGrid';
import '../Game/GameScreen.css';
import '../Game/GameOverOverlay.css';
import '../Coop/CoopScreen.css';
import './TwoVsTwoScreen.css';

function calcHitDirection(
  slot: TwoVsTwoSlot,
  step: number,
  paths: Record<TwoVsTwoSlot, Position[]>,
  starts: Record<TwoVsTwoSlot, Position>,
): { dx: number; dy: number } {
  const victimSeq = [starts[slot], ...paths[slot]];
  const victimPos = victimSeq[Math.min(step, victimSeq.length - 1)];
  const opposingSlots: TwoVsTwoSlot[] = slot.startsWith('red')
    ? ['blue_top', 'blue_bottom']
    : ['red_top', 'red_bottom'];

  for (const opSlot of opposingSlots) {
    const opSeq = [starts[opSlot], ...paths[opSlot]];
    const opCur = opSeq[Math.min(step, opSeq.length - 1)];
    if (opCur.row === victimPos.row && opCur.col === victimPos.col) {
      const opPrev = opSeq[Math.min(Math.max(step - 1, 0), opSeq.length - 1)];
      return { dx: opCur.col - opPrev.col, dy: opCur.row - opPrev.row };
    }
  }
  return { dx: 0, dy: 0 };
}

interface Props {
  onLeaveToLobby: () => void;
}

const STEP_DURATION_MS = 200;
const HIT_STOP_MS = 100;
const HIT_VISUAL_DELAY_MS = 0;
const DEFAULT_CELL = 96;
const MIN_CELL = 52;
const MAX_CELL = 160;

function computeInitialCellSize(): number {
  const availW = Math.max(260, window.innerWidth - 24);
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


function getTeamMates(state: TwoVsTwoClientState, team: 'red' | 'blue') {
  return Object.values(state.players).filter((player) => player.team === team);
}

function buildDisplayPositions(state: TwoVsTwoClientState) {
  return Object.fromEntries(
    Object.values(state.players).map((player) => [player.slot, player.position]),
  ) as Record<TwoVsTwoSlot, Position>;
}

export function TwoVsTwoScreen({ onLeaveToLobby }: Props) {
  const { lang } = useLang();
  const {
    twoVsTwoSlot,
    setMyColor,
    setRoomCode,
    setTwoVsTwoSlot,
    setRematchRequestSent,
    rematchRequestSent,
    setTwoVsTwoDisplayPositions,
    startTwoVsTwoAnimation,
    advanceTwoVsTwoStep,
    finishTwoVsTwoAnimation,
    accountDailyRewardTokens,
    isSfxMuted,
    sfxVolume,
  } = useGameStore();
  const [state, setState] = useState<TwoVsTwoClientState | null>(null);
  const [roundInfo, setRoundInfo] = useState<TwoVsTwoRoundStartPayload | null>(null);
  const [myPath, setMyPath] = useState<Position[]>([]);
  const [allyPath, setAllyPath] = useState<Position[]>([]);
  const [enemyPaths, setEnemyPaths] = useState<Record<TwoVsTwoSlot, Position[]>>({
    red_top: [],
    red_bottom: [],
    blue_top: [],
    blue_bottom: [],
  });
  const [hitSlots, setHitSlots] = useState<TwoVsTwoSlot[]>([]);
  const [explodingSlots, setExplodingSlots] = useState<TwoVsTwoSlot[]>([]);
  const [collisionEffects, setCollisionEffects] = useState<
    { id: number; position: Position; direction: { dx: number; dy: number } }[]
  >([]);
  const [mySubmitted, setMySubmitted] = useState(false);
  const [allySubmitted, setAllySubmitted] = useState(false);
  const [rematchRequested, setRematchRequested] = useState(false);
  const [gameOverMessage, setGameOverMessage] = useState<string | null>(null);
  const [keyboardControls, setKeyboardControls] = useState(
    loadKeyboardControlsSettings,
  );
  const [controllerControls, setControllerControls] = useState(
    loadControllerControlsSettings,
  );
  const timeoutRef = useRef<number | null>(null);
  const effectTimeoutsRef = useRef<number[]>([]);
  const stateRef = useRef<TwoVsTwoClientState | null>(null);
  const currentSlotRef = useRef<TwoVsTwoSlot>(twoVsTwoSlot ?? 'red_top');
  const gridAreaRef = useRef<HTMLDivElement>(null);
  const resultAudioPlayedRef = useRef(false);

  const currentSlot = twoVsTwoSlot ?? 'red_top';
  const cellSize = useAdaptiveCellSize(gridAreaRef);
  const scale = cellSize / DEFAULT_CELL;

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    currentSlotRef.current = currentSlot;
  }, [currentSlot]);

  useEffect(() => {
    const result =
      state?.phase === 'gameover' ? state.gameResult : null;
    if (!result || result === 'draw' || !state) {
      resultAudioPlayedRef.current = false;
      stopMatchResultBgm();
      return;
    }

    if (resultAudioPlayedRef.current) return;

    const myCurrentTeam = state.players[currentSlot].team;
    const didWin = result === myCurrentTeam;
    if (!isSfxMuted) {
      playMatchResultSfx(didWin ? 'victory' : 'defeat', sfxVolume);
    }
    startMatchResultBgm(didWin ? 'victory' : 'defeat');
    resultAudioPlayedRef.current = true;
  }, [currentSlot, isSfxMuted, sfxVolume, state]);

  useEffect(() => {
    return () => {
      stopMatchResultBgm();
    };
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);

  useEffect(() => {
    const syncControls = () => {
      setKeyboardControls(loadKeyboardControlsSettings());
      setControllerControls(loadControllerControlsSettings());
    };

    window.addEventListener(CONTROLS_SETTINGS_CHANGED_EVENT, syncControls);
    window.addEventListener('storage', syncControls);
    return () => {
      window.removeEventListener(CONTROLS_SETTINGS_CHANGED_EVENT, syncControls);
      window.removeEventListener('storage', syncControls);
    };
  }, []);

  useEffect(() => {
    if (state?.phase !== 'gameover') return;

    const isTypingTarget = () => {
      const active = document.activeElement;
      if (!(active instanceof HTMLElement)) return false;
      return (
        active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.tagName === 'SELECT' ||
        active.isContentEditable
      );
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isTypingTarget()) return;

      if (
        event.key === 'Escape' ||
        event.code === keyboardControls.gameActionKey
      ) {
        event.preventDefault();
        onLeaveToLobby();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [keyboardControls.gameActionKey, onLeaveToLobby, state?.phase]);

  useEffect(() => {
    if (
      state?.phase !== 'gameover' ||
      !controllerControls.controllerEnabled
    ) {
      return;
    }

    let raf = 0;
    let wasPressed = false;

    const pollControllerExit = () => {
      const gamepad = navigator.getGamepads().find(Boolean);
      const isPressed =
        gamepad?.buttons[controllerControls.gameActionButton]?.pressed === true;

      if (isPressed && !wasPressed) {
        onLeaveToLobby();
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
    onLeaveToLobby,
    state?.phase,
  ]);

  const clearAnimationTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const clearEffectTimeouts = useCallback(() => {
    for (const timeoutId of effectTimeoutsRef.current) {
      window.clearTimeout(timeoutId);
    }
    effectTimeoutsRef.current = [];
  }, []);

  const applyState = useCallback((nextState: TwoVsTwoClientState) => {
    stateRef.current = nextState;
    setState(nextState);
    setTwoVsTwoDisplayPositions(buildDisplayPositions(nextState));
    setMyPath([]);
    setAllyPath([]);
    setEnemyPaths({
      red_top: [],
      red_bottom: [],
      blue_top: [],
      blue_bottom: [],
    });
    setHitSlots([]);
    setExplodingSlots([]);
    setCollisionEffects([]);
    setMySubmitted(Boolean(nextState.players[currentSlot]?.pathSubmitted));
    const ally = Object.values(nextState.players).find(
      (player) =>
        player.team === nextState.players[currentSlot].team &&
        player.slot !== currentSlot,
    );
    setAllySubmitted(Boolean(ally?.pathSubmitted));
    if (nextState.phase !== 'gameover') {
      setGameOverMessage(null);
      setRematchRequested(false);
      setRematchRequestSent(false);
    }
  }, [currentSlot, setRematchRequestSent, setTwoVsTwoDisplayPositions]);

  const animateResolution = useCallback((payload: TwoVsTwoResolutionPayload) => {
    clearAnimationTimeout();
    clearEffectTimeouts();
    startTwoVsTwoAnimation(payload);

    const maxSteps = Math.max(
      ...(Object.keys(payload.paths) as TwoVsTwoSlot[]).map(
        (slot) => [payload.starts[slot], ...payload.paths[slot]].length,
      ),
      1,
    );

    const hitsByStep = new Map<number, TwoVsTwoPlayerHitEvent[]>();
    for (const hit of payload.playerHits) {
      const hits = hitsByStep.get(hit.step) ?? [];
      hits.push(hit);
      hitsByStep.set(hit.step, hits);
    }

    setEnemyPaths(payload.paths);
    let step = 0;
    const tick = () => {
      if (step >= maxSteps) {
        finishTwoVsTwoAnimation();
        setEnemyPaths({ red_top: [], red_bottom: [], blue_top: [], blue_bottom: [] });
        return;
      }

      advanceTwoVsTwoStep();

      const stepHits = hitsByStep.get(step) ?? [];
      if (stepHits.length > 0) {
        setState((prev) => {
          if (!prev) return prev;
          const players = { ...prev.players };
          for (const hit of stepHits) {
            players[hit.slot] = { ...players[hit.slot], hp: hit.newHp };
          }
          return { ...prev, players };
        });

        const visualHitId = window.setTimeout(() => {
          setHitSlots(stepHits.map((hit) => hit.slot));
          setCollisionEffects(
            stepHits.map((hit) => ({
              id: Date.now() + Math.random(),
              position: ([payload.starts[hit.slot], ...payload.paths[hit.slot]])[
                Math.min(step + 1, payload.paths[hit.slot].length)
              ],
              direction: calcHitDirection(hit.slot, step, payload.paths, payload.starts),
            })),
          );

          const resetHitsId = window.setTimeout(() => {
            setHitSlots([]);
            setCollisionEffects([]);
            effectTimeoutsRef.current = effectTimeoutsRef.current.filter((id) => id !== resetHitsId);
          }, 600);
          effectTimeoutsRef.current.push(resetHitsId);

          const killed = stepHits.filter((hit) => hit.newHp <= 0).map((hit) => hit.slot);
          if (killed.length > 0) {
            const explodeId = window.setTimeout(() => {
              setExplodingSlots((prev) => [...new Set([...prev, ...killed])]);
              const removeExplodeId = window.setTimeout(() => {
                setExplodingSlots((prev) => prev.filter((slot) => !killed.includes(slot)));
                effectTimeoutsRef.current = effectTimeoutsRef.current.filter(
                  (id) => id !== removeExplodeId,
                );
              }, 600);
              effectTimeoutsRef.current.push(removeExplodeId);
              effectTimeoutsRef.current = effectTimeoutsRef.current.filter((id) => id !== explodeId);
            }, 600);
            effectTimeoutsRef.current.push(explodeId);
          }

          effectTimeoutsRef.current = effectTimeoutsRef.current.filter((id) => id !== visualHitId);
        }, HIT_VISUAL_DELAY_MS);
        effectTimeoutsRef.current.push(visualHitId);
      }

      step += 1;
      timeoutRef.current = window.setTimeout(tick, STEP_DURATION_MS + (stepHits.length > 0 ? HIT_STOP_MS : 0));
    };

    timeoutRef.current = window.setTimeout(tick, STEP_DURATION_MS);
  }, [
    advanceTwoVsTwoStep,
    clearAnimationTimeout,
    clearEffectTimeouts,
    finishTwoVsTwoAnimation,
    startTwoVsTwoAnimation,
  ]);

  useEffect(() => {
    const socket = getSocket();

    const onGameStart = (nextState: TwoVsTwoClientState) => {
      setRoundInfo(null);
      applyState(nextState);
    };

    const onRoundStart = (payload: TwoVsTwoRoundStartPayload) => {
      void syncServerTime(socket);
      setRoundInfo(payload);
      applyState(payload.state);
    };

    const onRoomJoined = ({
      roomId,
      slot,
      team,
    }: {
      roomId: string;
      slot: TwoVsTwoSlot;
      team: 'red' | 'blue';
    }) => {
      setMyColor(team);
      setTwoVsTwoSlot(slot);
      setRoomCode(roomId);
      setRoundInfo(null);
      setState(null);
      setMyPath([]);
      setAllyPath([]);
      setEnemyPaths({ red_top: [], red_bottom: [], blue_top: [], blue_bottom: [] });
      setHitSlots([]);
      setExplodingSlots([]);
      setCollisionEffects([]);
      setMySubmitted(false);
      setAllySubmitted(false);
      setRematchRequested(false);
      setRematchRequestSent(false);
      setGameOverMessage(null);
      socket.emit('twovtwo_client_ready');
    };

    const onMatchmakingWaiting = () => {
      setRematchRequested(true);
      setGameOverMessage(lang === 'en' ? 'Waiting for another team...' : '다른 팀을 찾는 중...');
    };

    const onPathUpdated = ({
      slot,
      team,
      path,
    }: {
      slot: TwoVsTwoSlot;
      team: 'red' | 'blue';
      path: Position[];
    }) => {
      const latestState = stateRef.current;
      const latestSlot = currentSlotRef.current;
      if (!latestState) return;
      const myTeam = latestState.players[latestSlot].team;
      if (slot === latestSlot) return;
      if (team !== myTeam) return;
      setAllyPath(path);
    };

    const onPlayerSubmitted = ({
      slot,
      path,
    }: {
      slot: TwoVsTwoSlot;
      team: 'red' | 'blue';
      path: Position[];
    }) => {
      setState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: {
            ...prev.players,
            [slot]: { ...prev.players[slot], pathSubmitted: true },
          },
        };
      });
      const latestState = stateRef.current;
      const latestSlot = currentSlotRef.current;
      if (!latestState) return;
      const myTeam = latestState.players[latestSlot].team;
      if (slot === latestSlot) {
        setMyPath(path);
        setMySubmitted(true);
      } else if (latestState.players[slot].team === myTeam) {
        setAllyPath(path);
        setAllySubmitted(true);
      }
    };

    const onPlayerDisconnected = ({
      slot,
      state: nextState,
    }: {
      slot: TwoVsTwoSlot;
      state: TwoVsTwoClientState;
    }) => {
      stateRef.current = nextState;
      setState(nextState);
      setTwoVsTwoDisplayPositions(buildDisplayPositions(nextState));
      if (slot === currentSlotRef.current) {
        setMyPath([]);
        setMySubmitted(true);
      } else if (nextState.players[slot].team === nextState.players[currentSlotRef.current].team) {
        setAllyPath([]);
        setAllySubmitted(true);
      }
    };

    const onResolution = (payload: TwoVsTwoResolutionPayload) => {
      setRoundInfo(null);
      setState((prev) => (prev ? { ...prev, phase: 'moving' } : prev));
      animateResolution(payload);
    };

    const onGameOver = ({
      result,
      message,
    }: {
      result: 'red' | 'blue' | 'draw';
      message?: string;
    }) => {
      setState((prev) =>
        prev ? { ...prev, phase: 'gameover', gameResult: result } : prev,
      );
      if (message) setGameOverMessage(message);
      clearAnimationTimeout();
      finishTwoVsTwoAnimation();
      setEnemyPaths({ red_top: [], red_bottom: [], blue_top: [], blue_bottom: [] });
    };

    const onChatReceive = (msg: ChatMessage) => {
      useGameStore.getState().addMessage(msg);
    };

    const onPlayerSkinUpdated = ({
      slot,
      pieceSkin,
    }: {
      slot: TwoVsTwoSlot;
      pieceSkin: TwoVsTwoClientState['players'][TwoVsTwoSlot]['pieceSkin'];
    }) => {
      setState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: {
            ...prev.players,
            [slot]: { ...prev.players[slot], pieceSkin },
          },
        };
      });
    };

    const onRematchRequested = () => setRematchRequested(true);

    socket.on('twovtwo_game_start', onGameStart);
    socket.on('twovtwo_round_start', onRoundStart);
    socket.on('twovtwo_room_joined', onRoomJoined);
    socket.on('twovtwo_matchmaking_waiting', onMatchmakingWaiting);
    socket.on('twovtwo_path_updated', onPathUpdated);
    socket.on('twovtwo_player_submitted', onPlayerSubmitted);
    socket.on('twovtwo_player_disconnected', onPlayerDisconnected);
    socket.on('twovtwo_resolution', onResolution);
    socket.on('twovtwo_game_over', onGameOver);
    socket.on('chat_receive', onChatReceive);
    socket.on('player_skin_updated', onPlayerSkinUpdated);
    socket.on('rematch_requested', onRematchRequested);
    socket.emit('twovtwo_client_ready');

    return () => {
      clearAnimationTimeout();
      clearEffectTimeouts();
      finishTwoVsTwoAnimation();
      setTwoVsTwoDisplayPositions(null);
      socket.off('twovtwo_game_start', onGameStart);
      socket.off('twovtwo_round_start', onRoundStart);
      socket.off('twovtwo_room_joined', onRoomJoined);
      socket.off('twovtwo_matchmaking_waiting', onMatchmakingWaiting);
      socket.off('twovtwo_path_updated', onPathUpdated);
      socket.off('twovtwo_player_submitted', onPlayerSubmitted);
      socket.off('twovtwo_player_disconnected', onPlayerDisconnected);
      socket.off('twovtwo_resolution', onResolution);
      socket.off('twovtwo_game_over', onGameOver);
      socket.off('chat_receive', onChatReceive);
      socket.off('player_skin_updated', onPlayerSkinUpdated);
      socket.off('rematch_requested', onRematchRequested);
    };
  }, [
    animateResolution,
    applyState,
    clearAnimationTimeout,
    clearEffectTimeouts,
    finishTwoVsTwoAnimation,
    lang,
    setMyColor,
    setRoomCode,
    setTwoVsTwoDisplayPositions,
    setTwoVsTwoSlot,
  ]);

  if (!state) {
    return <div className="gs-loading">{lang === 'en' ? 'Loading 2v2...' : '2v2 로딩 중...'}</div>;
  }

  const myTeam = state.players[currentSlot].team;
  const enemyTeam = myTeam === 'red' ? 'blue' : 'red';
  const [me, ally] = getTeamMates(state, myTeam).sort((a, b) =>
    a.slot === currentSlot ? -1 : b.slot === currentSlot ? 1 : a.slot.localeCompare(b.slot),
  );
  const [enemyLeft, enemyRight] = getTeamMates(state, enemyTeam);

  const resultCopy = state.gameResult
    ? state.gameResult === 'draw'
      ? lang === 'en'
        ? 'Draw'
        : '무승부'
      : state.gameResult === myTeam
        ? lang === 'en'
          ? 'Victory'
          : '승리'
        : lang === 'en'
          ? 'Defeat'
          : '패배'
    : null;

  const roleLabel =
    state.attackerTeam === myTeam
      ? lang === 'en'
        ? 'Attack'
        : '공격'
      : lang === 'en'
        ? 'Escape'
        : '도망';

  const handleRematch = () => {
    getSocket().emit('request_rematch');
    setRematchRequestSent(true);
  };
  const dailyRewardRemaining = Math.max(0, 120 - accountDailyRewardTokens);
  const rewardCopy =
    state.phase === 'gameover' && state.gameResult === myTeam
      ? Math.min(6, dailyRewardRemaining) > 0
        ? lang === 'en'
          ? `+${Math.min(6, dailyRewardRemaining)} Tokens`
          : `+${Math.min(6, dailyRewardRemaining)} 토큰 획득`
        : null
      : null;

  return (
    <div
      className="game-screen twovtwo-screen"
      style={{ '--gs-scale': scale } as CSSProperties}
    >
      <div className="gs-utility-bar">
        <div className="gs-timer-slot">
          {state.phase === 'planning' && roundInfo && (
            <TimerBar duration={roundInfo.timeLimit} roundEndsAt={roundInfo.roundEndsAt} />
          )}
          {state.phase === 'moving' && (
            <div className="gs-phase-moving">
              <span className="gs-moving-pip" />
              {lang === 'en' ? 'Resolving' : '해결 중'}
            </div>
          )}
        </div>
        <div className="gs-utility-buttons">
          <button className="gs-lobby-btn" onClick={onLeaveToLobby}>Lobby</button>
        </div>
      </div>

      <div className={`twovtwo-team-card twovtwo-team-card-opponent twovtwo-team-${enemyTeam}`}>
        <div className="twovtwo-player-side">
          {enemyLeft.connected ? (
            <PlayerInfo player={enemyLeft} isMe={false} />
          ) : (
            <div className="twovtwo-player-disconnected">
              {lang === 'en' ? 'Disconnected' : '연결 끊김'}
            </div>
          )}
          <div className="twovtwo-hp">{renderHearts(enemyLeft.hp)}</div>
        </div>
        <div className="twovtwo-role-box gs-role-badge">
          <div className="twovtwo-role-sub">
            {lang === 'en' ? `Turn ${state.turn}` : `${state.turn}턴`}
          </div>
        </div>
        <div className="twovtwo-player-side twovtwo-player-side-right">
          {enemyRight.connected ? (
            <PlayerInfo player={enemyRight} isMe={false} />
          ) : (
            <div className="twovtwo-player-disconnected">
              {lang === 'en' ? 'Disconnected' : '연결 끊김'}
            </div>
          )}
          <div className="twovtwo-hp">{renderHearts(enemyRight.hp)}</div>
        </div>
      </div>

      <div className="gs-board-stage">
        {resultCopy && (
          <div className="gs-result-slot">
            <div className="gameover-overlay">
              <div className="gameover-box">
                <div className={`gameover-result ${state.gameResult === myTeam ? 'win' : 'lose'}`}>
                  {resultCopy}
                </div>
                {gameOverMessage && <div className="gameover-message">{gameOverMessage}</div>}
                {rewardCopy && <div className="gameover-reward">{rewardCopy}</div>}
                {rematchRequested && (
                  <div className="rematch-notice">
                    {lang === 'en' ? 'A player requested rematch.' : '한 플레이어가 재도전을 요청했습니다.'}
                  </div>
                )}
                {rematchRequestSent && (
                  <div className="rematch-notice">
                    {lang === 'en' ? 'Rematch request sent.' : '재도전 요청을 보냈습니다.'}
                  </div>
                )}
                <button className="rematch-btn" onClick={handleRematch} disabled={rematchRequestSent}>
                  {lang === 'en' ? 'Retry' : '재도전'}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="gs-grid-area" ref={gridAreaRef}>
          <TwoVsTwoGrid
            state={state}
            roundInfo={roundInfo}
            currentSlot={currentSlot}
            myPath={myPath}
            allyPath={allyPath}
            enemyPaths={enemyPaths}
            setMyPath={setMyPath}
            setMySubmitted={() => setMySubmitted(true)}
            hitSlots={hitSlots}
            explodingSlots={explodingSlots}
            collisionEffects={collisionEffects}
          />
        </div>
      </div>

      <div
        className={`twovtwo-team-card twovtwo-team-card-self twovtwo-team-${myTeam} gs-self gs-role-${me?.role === 'attacker' ? 'atk' : 'run'}`}
      >
        <div className="twovtwo-player-side">
          {me.connected ? (
            <PlayerInfo player={me} isMe />
          ) : (
            <div className="twovtwo-player-disconnected">
              {lang === 'en' ? 'Disconnected' : '연결 끊김'}
            </div>
          )}
          <div className="twovtwo-hp">{renderHearts(me.hp)}</div>
        </div>
        <div
          className={`twovtwo-role-box gs-role-badge gs-role-badge-self gs-role-badge-${me?.role === 'attacker' ? 'atk' : 'run'}`}
        >
          <span className="gs-role-icon">
            {state.attackerTeam === myTeam ? 'ATK' : 'RUN'}
          </span>
          <span className="gs-role-label">{roleLabel}</span>
        </div>
        <div className="twovtwo-player-side twovtwo-player-side-right">
          {ally.connected ? (
            <PlayerInfo player={ally} isMe={false} />
          ) : (
            <div className="twovtwo-player-disconnected">
              {lang === 'en' ? 'Disconnected' : '연결 끊김'}
            </div>
          )}
          <div className="twovtwo-hp">{renderHearts(ally.hp)}</div>
        </div>
      </div>

      <div className="coop-path-bar">
        <div className="coop-path-bar__label">{lang === 'en' ? 'Path Points' : '경로 포인트'}</div>
        <div className="coop-path-bar__track">
          {Array.from({ length: state.pathPoints }, (_, index) => (
            <span
              key={index}
              className={`coop-path-bar__pip ${index < myPath.length ? 'is-filled' : ''}`}
            />
          ))}
        </div>
        <div className="coop-path-bar__value">
          {myPath.length} / {state.pathPoints}
          {allySubmitted && state.phase === 'planning' ? ` · ${lang === 'en' ? 'ally ready' : '팀원 준비'}` : ''}
          {mySubmitted && state.phase === 'planning' ? ` · ${lang === 'en' ? 'ready' : '준비 완료'}` : ''}
        </div>
      </div>
    </div>
  );
}

function renderHearts(hp: number) {
  return Array.from({ length: 3 }, (_, index) => (
    <span key={index} className={`heart ${index < hp ? 'filled' : 'empty'}`}>
      {index < hp ? '♥' : '♡'}
    </span>
  ));
}


