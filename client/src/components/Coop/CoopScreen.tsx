import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getSocket } from "../../socket/socketClient";
import { useLang } from "../../hooks/useLang";
import { useGameStore } from "../../store/gameStore";
import type { ChatMessage, PlayerColor, Position } from "../../types/game.types";
import type {
  CoopClientState,
  CoopEnemyPreview,
  CoopPortal,
  CoopResolutionPayload,
  CoopRoundStartPayload,
} from "../../types/coop.types";
import { playHit } from "../../utils/soundUtils";
import { ChatPanel } from "../Game/ChatPanel";
import { HpDisplay } from "../Game/HpDisplay";
import { PlayerInfo } from "../Game/PlayerInfo";
import { TimerBar } from "../Game/TimerBar";
import { CoopGrid } from "./CoopGrid";
import "../Game/GameScreen.css";
import "../Game/GameOverOverlay.css";
import "./CoopScreen.css";

interface Props {
  onLeaveToLobby: () => void;
}

const STEP_DURATION_MS = 200;
const INITIAL_RED: Position = { row: 2, col: 0 };
const INITIAL_BLUE: Position = { row: 2, col: 4 };

type EnemyDisplayMap = Record<string, Position>;

function getRoleIcon(role: "attacker" | "escaper") {
  return role === "attacker" ? "COOP" : "ROUND";
}

function buildEnemyDisplayMap(enemies: CoopClientState["enemies"]): EnemyDisplayMap {
  return Object.fromEntries(enemies.map((enemy) => [enemy.id, enemy.position]));
}

export function CoopScreen({ onLeaveToLobby }: Props) {
  const { lang } = useLang();
  const { myColor, isSfxMuted, sfxVolume } = useGameStore();
  const [coopState, setCoopState] = useState<CoopClientState | null>(null);
  const [roundInfo, setRoundInfo] = useState<CoopRoundStartPayload | null>(null);
  const [myPath, setMyPath] = useState<Position[]>([]);
  const [allyPath, setAllyPath] = useState<Position[]>([]);
  const [redDisplayPos, setRedDisplayPos] = useState(INITIAL_RED);
  const [blueDisplayPos, setBlueDisplayPos] = useState(INITIAL_BLUE);
  const [enemyDisplayPositions, setEnemyDisplayPositions] = useState<EnemyDisplayMap>({});
  const [portals, setPortals] = useState<CoopPortal[]>([]);
  const [movingEnemyPaths, setMovingEnemyPaths] = useState<CoopEnemyPreview[] | null>(null);
  const [hitPortalIds, setHitPortalIds] = useState<string[]>([]);
  const [mySubmitted, setMySubmitted] = useState(false);
  const [allySubmitted, setAllySubmitted] = useState(false);
  const [rematchRequested, setRematchRequested] = useState(false);
  const [rematchRequestSent, setRematchRequestSent] = useState(false);
  const [gameOverMessage, setGameOverMessage] = useState<string | null>(null);
  const timeoutRef = useRef<number | null>(null);
  const portalHitTimeoutsRef = useRef<number[]>([]);

  const currentColor = myColor ?? "red";
  const allyColor: PlayerColor = currentColor === "red" ? "blue" : "red";

  const clearAnimationTimeout = useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const clearPortalHitTimeouts = useCallback(() => {
    for (const timeoutId of portalHitTimeoutsRef.current) {
      window.clearTimeout(timeoutId);
    }
    portalHitTimeoutsRef.current = [];
  }, []);

  const syncDisplayFromState = useCallback((state: CoopClientState) => {
    setRedDisplayPos(state.players.red.position);
    setBlueDisplayPos(state.players.blue.position);
    setEnemyDisplayPositions(buildEnemyDisplayMap(state.enemies));
    setPortals(state.portals);
  }, []);

  const applyState = useCallback(
    (state: CoopClientState) => {
      setCoopState(state);
      setMovingEnemyPaths(null);
      setHitPortalIds([]);
      setMyPath([]);
      setAllyPath([]);
      setMySubmitted(Boolean(state.players[currentColor]?.pathSubmitted));
      setAllySubmitted(Boolean(state.players[allyColor]?.pathSubmitted));
      setRematchRequested(false);
      setRematchRequestSent(false);
      if (state.phase !== "gameover") {
        setGameOverMessage(null);
      }
      syncDisplayFromState(state);
    },
    [allyColor, currentColor, syncDisplayFromState],
  );

  const animateResolution = useCallback(
    (payload: CoopResolutionPayload) => {
      clearAnimationTimeout();

      const redSeq = [payload.redStart, ...payload.redPath];
      const blueSeq = [payload.blueStart, ...payload.bluePath];
      const enemySeqs = payload.enemyMoves.map((enemy) => ({
        id: enemy.id,
        seq: [enemy.start, ...enemy.path],
      }));
      const maxSteps = Math.max(
        redSeq.length,
        blueSeq.length,
        ...enemySeqs.map((entry) => entry.seq.length),
      );

      const portalHitsByStep = new Map<number, typeof payload.portalHits>();
      for (const hit of payload.portalHits) {
        const hits = portalHitsByStep.get(hit.step) ?? [];
        hits.push(hit);
        portalHitsByStep.set(hit.step, hits);
      }

      const playerHitsByStep = new Map<number, typeof payload.playerHits>();
      for (const hit of payload.playerHits) {
        const hits = playerHitsByStep.get(hit.step) ?? [];
        hits.push(hit);
        playerHitsByStep.set(hit.step, hits);
      }

      setMovingEnemyPaths(payload.enemyMoves);

      let step = 0;
      const tick = () => {
        if (step >= maxSteps) {
          setMovingEnemyPaths(null);
          return;
        }

        setRedDisplayPos(redSeq[Math.min(step, redSeq.length - 1)]);
        setBlueDisplayPos(blueSeq[Math.min(step, blueSeq.length - 1)]);

        const nextEnemyPositions: EnemyDisplayMap = {};
        for (const enemy of enemySeqs) {
          nextEnemyPositions[enemy.id] = enemy.seq[Math.min(step, enemy.seq.length - 1)];
        }
        setEnemyDisplayPositions(nextEnemyPositions);

        const portalHits = portalHitsByStep.get(step) ?? [];
        if (portalHits.length > 0) {
          const flashedPortalIds = portalHits
            .filter((hit) => !hit.destroyed && hit.newHp > 0)
            .map((hit) => hit.portalId);

          setPortals((prev) =>
            prev.flatMap((portal) => {
              const hit = portalHits.find((entry) => entry.portalId === portal.id);
              if (!hit) return [portal];
              if (hit.destroyed || hit.newHp <= 0) return [];
              return [{ ...portal, hp: hit.newHp }];
            }),
          );

          if (flashedPortalIds.length > 0) {
            setHitPortalIds((prev) => Array.from(new Set([...prev, ...flashedPortalIds])));
            const timeoutId = window.setTimeout(() => {
              setHitPortalIds((prev) => prev.filter((id) => !flashedPortalIds.includes(id)));
              portalHitTimeoutsRef.current = portalHitTimeoutsRef.current.filter((id) => id !== timeoutId);
            }, 600);
            portalHitTimeoutsRef.current.push(timeoutId);
          }
        }

        const playerHits = playerHitsByStep.get(step) ?? [];
        if (playerHits.length > 0) {
          setCoopState((prev) => {
            if (!prev) return prev;
            const players = { ...prev.players };
            for (const hit of playerHits) {
              players[hit.color] = { ...players[hit.color], hp: hit.newHp };
            }
            return { ...prev, players };
          });
          if (!isSfxMuted) {
            playHit(sfxVolume);
          }
        }

        step += 1;
        timeoutRef.current = window.setTimeout(tick, STEP_DURATION_MS);
      };

      timeoutRef.current = window.setTimeout(tick, STEP_DURATION_MS);
    },
    [clearAnimationTimeout, isSfxMuted, sfxVolume],
  );

  useEffect(() => {
    useGameStore.setState({ messages: [] });

    const socket = getSocket();

    const onGameStart = (state: CoopClientState) => {
      setRoundInfo(null);
      applyState(state);
    };

    const onRoundStart = (payload: CoopRoundStartPayload) => {
      setRoundInfo(payload);
      applyState(payload.state);
    };

    const onPathUpdated = ({
      color,
      path,
    }: {
      color: PlayerColor;
      path: Position[];
    }) => {
      if (color === currentColor) {
        setMyPath(path);
        return;
      }
      setAllyPath(path);
    };

    const onPlayerSubmitted = ({ color }: { color: PlayerColor }) => {
      setCoopState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: {
            ...prev.players,
            [color]: { ...prev.players[color], pathSubmitted: true },
          },
        };
      });
      if (color === currentColor) {
        setMySubmitted(true);
      } else {
        setAllySubmitted(true);
      }
    };

    const onResolution = (payload: CoopResolutionPayload) => {
      setRoundInfo(null);
      setCoopState((prev) => (prev ? { ...prev, phase: "moving" } : prev));
      animateResolution(payload);
    };

    const onGameOver = ({
      result,
      message,
    }: {
      result: "win" | "lose";
      message?: string;
    }) => {
      setCoopState((prev) => {
        if (!prev) return prev;
        return { ...prev, phase: "gameover" as const, gameResult: result };
      });
      if (message) setGameOverMessage(message);
      clearAnimationTimeout();
      setMovingEnemyPaths(null);
    };

    const onChatReceive = (msg: ChatMessage) => {
      useGameStore.getState().addMessage(msg);
    };

    const onPlayerSkinUpdated = ({
      color,
      pieceSkin,
    }: {
      color: PlayerColor;
      pieceSkin: CoopClientState["players"]["red"]["pieceSkin"];
    }) => {
      setCoopState((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          players: {
            ...prev.players,
            [color]: { ...prev.players[color], pieceSkin },
          },
        };
      });
    };

    const onRematchRequested = () => {
      setRematchRequested(true);
    };

    socket.on("coop_game_start", onGameStart);
    socket.on("coop_round_start", onRoundStart);
    socket.on("coop_path_updated", onPathUpdated);
    socket.on("coop_player_submitted", onPlayerSubmitted);
    socket.on("coop_resolution", onResolution);
    socket.on("coop_game_over", onGameOver);
    socket.on("chat_receive", onChatReceive);
    socket.on("player_skin_updated", onPlayerSkinUpdated);
    socket.on("rematch_requested", onRematchRequested);
    socket.emit("coop_client_ready");

    return () => {
      clearAnimationTimeout();
      clearPortalHitTimeouts();
      socket.off("coop_game_start", onGameStart);
      socket.off("coop_round_start", onRoundStart);
      socket.off("coop_path_updated", onPathUpdated);
      socket.off("coop_player_submitted", onPlayerSubmitted);
      socket.off("coop_resolution", onResolution);
      socket.off("coop_game_over", onGameOver);
      socket.off("chat_receive", onChatReceive);
      socket.off("player_skin_updated", onPlayerSkinUpdated);
      socket.off("rematch_requested", onRematchRequested);
    };
  }, [animateResolution, applyState, clearAnimationTimeout, clearPortalHitTimeouts, currentColor]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  }, []);

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

      if (
        (event.key === "r" || event.key === "R") &&
        coopState?.phase === "gameover" &&
        !rematchRequestSent
      ) {
        event.preventDefault();
        getSocket().emit("request_rematch");
        setRematchRequestSent(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [coopState?.phase, onLeaveToLobby, rematchRequestSent]);

  const resultCopy = useMemo(() => {
    if (!coopState || coopState.phase !== "gameover" || !coopState.gameResult) return null;
    if (coopState.gameResult === "win") {
      return lang === "en" ? "Mission Complete" : "협동전 승리";
    }
    return lang === "en" ? "Mission Failed" : "협동전 패배";
  }, [coopState, lang]);

  if (!coopState) {
    return <div className="gs-loading">{lang === "en" ? "Loading co-op..." : "협동전 로딩 중..."}</div>;
  }

  const me = coopState.players[currentColor];
  const ally = coopState.players[allyColor];
  const playerLabel = lang === "en" ? "Round" : "라운드";
  const subLabel = lang === "en" ? "Co-op" : "협동전";
  const finalWaveLabel = coopState.finalWave
    ? lang === "en"
      ? "Final Wave"
      : "최종 웨이브"
    : lang === "en"
      ? `Portals ${coopState.portalSpawnCount}`
      : `포탈 ${coopState.portalSpawnCount}개`;

  const handleRematch = () => {
    getSocket().emit("request_rematch");
    setRematchRequestSent(true);
  };

  return (
    <div className="game-screen coop-screen">
      <div className="gs-utility-bar">
        <div className="gs-timer-slot">
          {coopState.phase === "planning" && roundInfo && (
            <TimerBar duration={roundInfo.timeLimit} roundEndsAt={roundInfo.roundEndsAt} />
          )}
          {coopState.phase === "moving" && (
            <div className="gs-phase-moving">
              <span className="gs-moving-pip" />
              {lang === "en" ? "Resolving" : "해결 중"}
            </div>
          )}
        </div>
        <div className="gs-utility-buttons">
          <button className="gs-lobby-btn" onClick={onLeaveToLobby}>
            Lobby
          </button>
        </div>
      </div>

      <div className={`gs-player-card gs-opponent gs-color-${allyColor}`}>
        <div className="gs-role-badge">
          <span className="gs-role-icon">{getRoleIcon("attacker")}</span>
          <span className="gs-role-label">{subLabel}</span>
        </div>
        <div className="gs-player-mid">
          <PlayerInfo player={ally as never} isMe={false} />
          <span className="gs-color-tag">{allyColor === "red" ? "RED" : "BLUE"}</span>
        </div>
        <div className="gs-hp-slot">
          <HpDisplay color={allyColor} hp={ally.hp} myColor={currentColor} />
        </div>
      </div>

      <div className="gs-board-stage">
        {resultCopy && (
          <div className="gs-result-slot">
            <div className="gameover-overlay">
              <div className="gameover-box">
                <div className={`gameover-result ${coopState.gameResult === "win" ? "win" : "lose"}`}>
                  {resultCopy}
                </div>
                {gameOverMessage && <div className="gameover-message">{gameOverMessage}</div>}
                {rematchRequested && (
                  <div className="rematch-notice">
                    {lang === "en" ? "Teammate requested rematch." : "팀원이 재도전을 요청했습니다."}
                  </div>
                )}
                {rematchRequestSent && (
                  <div className="rematch-notice">
                    {lang === "en" ? "Rematch request sent." : "재도전 요청을 보냈습니다."}
                  </div>
                )}
                <button className="rematch-btn" onClick={handleRematch} disabled={rematchRequestSent}>
                  {lang === "en" ? "Retry" : "재도전"}
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="gs-grid-area">
          <CoopGrid
            state={coopState}
            myColor={currentColor}
            myPath={myPath}
            allyPath={allyPath}
            setMyPath={setMyPath}
            setMySubmitted={() => setMySubmitted(true)}
            roundInfo={roundInfo}
            redDisplayPos={redDisplayPos}
            blueDisplayPos={blueDisplayPos}
          enemyDisplayPositions={enemyDisplayPositions}
          portals={portals}
          movingEnemyPaths={movingEnemyPaths}
          hitPortalIds={hitPortalIds}
        />
        </div>
      </div>

      <div className={`gs-player-card gs-self gs-color-${currentColor}`}>
        <div className="gs-role-badge gs-role-badge-self">
          <span className="gs-role-icon">{coopState.round}</span>
          <span className="gs-role-label">{playerLabel}</span>
        </div>
        <div className="gs-player-mid">
          <PlayerInfo player={me as never} isMe />
          <span className="gs-color-tag">
            {finalWaveLabel}
            {allySubmitted && coopState.phase === "planning" ? ` · ${lang === "en" ? "ally ready" : "팀원 준비"}` : ""}
            {mySubmitted && coopState.phase === "planning" ? ` · ${lang === "en" ? "ready" : "준비 완료"}` : ""}
          </span>
        </div>
        <div className="gs-hp-slot">
          <HpDisplay color={currentColor} hp={me.hp} myColor={currentColor} />
        </div>
      </div>

      <div className="coop-path-bar">
        <div className="coop-path-bar__label">{lang === "en" ? "Path Points" : "경로 포인트"}</div>
        <div className="coop-path-bar__track">
          {Array.from({ length: coopState.pathPoints }, (_, index) => (
            <span
              key={index}
              className={`coop-path-bar__pip ${index < myPath.length ? "is-filled" : ""}`}
            />
          ))}
        </div>
        <div className="coop-path-bar__value">
          {myPath.length} / {coopState.pathPoints}
        </div>
      </div>

      <ChatPanel />
    </div>
  );
}
