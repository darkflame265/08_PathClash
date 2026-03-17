import { useCallback, useEffect, useRef, useState } from 'react';
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
import { ChatPanel } from '../Game/ChatPanel';
import { TimerBar } from '../Game/TimerBar';
import { PlayerInfo } from '../Game/PlayerInfo';
import { TwoVsTwoGrid } from './TwoVsTwoGrid';
import '../Game/GameScreen.css';
import '../Game/GameOverOverlay.css';
import '../Coop/CoopScreen.css';
import './TwoVsTwoScreen.css';

interface Props {
  onLeaveToLobby: () => void;
}

const STEP_DURATION_MS = 200;

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
    setRematchRequestSent,
    rematchRequestSent,
    setTwoVsTwoDisplayPositions,
    startTwoVsTwoAnimation,
    advanceTwoVsTwoStep,
    finishTwoVsTwoAnimation,
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
  const [collisionEffects, setCollisionEffects] = useState<{ id: number; position: Position }[]>([]);
  const [mySubmitted, setMySubmitted] = useState(false);
  const [allySubmitted, setAllySubmitted] = useState(false);
  const [rematchRequested, setRematchRequested] = useState(false);
  const [gameOverMessage, setGameOverMessage] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const effectTimeoutsRef = useRef<number[]>([]);

  const currentSlot = twoVsTwoSlot ?? 'red_top';

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

        setHitSlots(stepHits.map((hit) => hit.slot));
        setCollisionEffects(
          stepHits.map((hit) => ({
            id: Date.now() + Math.random(),
            position: ([payload.starts[hit.slot], ...payload.paths[hit.slot]])[
              Math.min(step + 1, payload.paths[hit.slot].length)
            ],
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
      }

      step += 1;
      timeoutRef.current = window.setTimeout(tick, STEP_DURATION_MS);
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

    const onPathUpdated = ({
      slot,
      team,
      path,
    }: {
      slot: TwoVsTwoSlot;
      team: 'red' | 'blue';
      path: Position[];
    }) => {
      if (!state) return;
      const myTeam = state.players[currentSlot].team;
      if (slot === currentSlot) return;
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
      if (!state) return;
      const myTeam = state.players[currentSlot].team;
      if (slot === currentSlot) {
        setMyPath(path);
        setMySubmitted(true);
      } else if (state.players[slot].team === myTeam) {
        setAllyPath(path);
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
    socket.on('twovtwo_path_updated', onPathUpdated);
    socket.on('twovtwo_player_submitted', onPlayerSubmitted);
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
      socket.off('twovtwo_path_updated', onPathUpdated);
      socket.off('twovtwo_player_submitted', onPlayerSubmitted);
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
    currentSlot,
    finishTwoVsTwoAnimation,
    setTwoVsTwoDisplayPositions,
    state,
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
  const enemyRoleLabel =
    state.attackerTeam === enemyTeam
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

  return (
    <div className="game-screen twovtwo-screen">
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
          <PlayerInfo player={enemyLeft} isMe={false} />
          <div className="twovtwo-hp">{renderHearts(enemyLeft.hp)}</div>
        </div>
        <div className="twovtwo-role-box">{enemyRoleLabel}</div>
        <div className="twovtwo-player-side twovtwo-player-side-right">
          <PlayerInfo player={enemyRight} isMe={false} />
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

        <div className="gs-grid-area">
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

      <div className={`twovtwo-team-card twovtwo-team-card-self twovtwo-team-${myTeam}`}>
        <div className="twovtwo-player-side">
          <PlayerInfo player={me} isMe />
          <div className="twovtwo-hp">{renderHearts(me.hp)}</div>
        </div>
        <div className="twovtwo-role-box">
          <div>{roleLabel}</div>
          <div className="twovtwo-role-sub">
            {lang === 'en' ? `Turn ${state.turn}` : `${state.turn}턴`}
          </div>
        </div>
        <div className="twovtwo-player-side twovtwo-player-side-right">
          <PlayerInfo player={ally} isMe={false} />
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

      <ChatPanel />
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
