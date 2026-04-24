import { Socket } from "socket.io-client";
import { useGameStore } from "../store/gameStore";
import { translations } from "../i18n/translations";
import type {
  ClientGameState,
  PathsRevealPayload,
  RoundStartPayload,
  ChatMessage,
  PlayerColor,
  PieceSkin,
} from "../types/game.types";
import { playHit } from "../utils/soundUtils";
import { syncServerTime } from "./timeSync";

export function registerSocketHandlers(socket: Socket): () => void {
  const store = useGameStore.getState;

  const onGameStart = (gs: ClientGameState) => {
    store().setGameState(gs);
  };

  const onRoundStart = (payload: RoundStartPayload) => {
    void syncServerTime(socket);
    store().setRoundInfo(payload);
  };

  const onOpponentSubmitted = () => {
    store().setOpponentSubmitted(true);
  };

  const onPathsReveal = (payload: PathsRevealPayload) => {
    store().startAnimation(payload);
    runAnimation(payload);
  };

  const onGameOver = ({ winner }: { winner: PlayerColor }) => {
    store().setWinner(winner);
    store().setGameOverMessage(null);
    const gs = store().gameState;
    if (gs) {
      useGameStore.setState({ gameState: { ...gs, phase: "gameover" } });
    }
  };

  const onOpponentDisconnected = () => {
    const gs = store().gameState;
    const myColor = store().myColor;
    const currentRoundInfo = store().roundInfo;
    if (!gs || !myColor) return;
    const opponentColor = myColor === "red" ? "blue" : "red";
    store().setGameOverMessage(translations[store().lang].opponentLeft);
    useGameStore.setState({
      roundInfo: currentRoundInfo
        ? {
            ...currentRoundInfo,
            pathPoints: 30,
          }
        : null,
      gameState: {
        ...gs,
        pathPoints: 30,
        players: {
          ...gs.players,
          [opponentColor]: {
            ...gs.players[opponentColor],
            connected: false,
          },
        },
      },
      rematchRequested: false,
    });
  };

  const onRematchRequested = () => {
    store().setRematchRequested(true);
  };

  const onRematchStart = (gs: ClientGameState) => {
    store().resetGame();
    store().setGameState(gs);
  };

  const onChatReceive = (msg: ChatMessage) => {
    store().addMessage(msg);
  };

  const onPlayerSkinUpdated = ({
    color,
    pieceSkin,
  }: {
    color: PlayerColor;
    pieceSkin: PieceSkin;
  }) => {
    const gs = store().gameState;
    store().setPlayerPieceSkin(color, pieceSkin);
    if (!gs) return;
    useGameStore.setState({
      gameState: {
        ...gs,
        players: {
          ...gs.players,
          [color]: { ...gs.players[color], pieceSkin },
        },
      },
    });
  };

  socket.on("game_start", onGameStart);
  socket.on("round_start", onRoundStart);
  socket.on("opponent_submitted", onOpponentSubmitted);
  socket.on("paths_reveal", onPathsReveal);
  socket.on("game_over", onGameOver);
  socket.on("opponent_disconnected", onOpponentDisconnected);
  socket.on("rematch_requested", onRematchRequested);
  socket.on("rematch_start", onRematchStart);
  socket.on("chat_receive", onChatReceive);
  socket.on("player_skin_updated", onPlayerSkinUpdated);

  return () => {
    socket.off("game_start", onGameStart);
    socket.off("round_start", onRoundStart);
    socket.off("opponent_submitted", onOpponentSubmitted);
    socket.off("paths_reveal", onPathsReveal);
    socket.off("game_over", onGameOver);
    socket.off("opponent_disconnected", onOpponentDisconnected);
    socket.off("rematch_requested", onRematchRequested);
    socket.off("rematch_start", onRematchStart);
    socket.off("chat_receive", onChatReceive);
    socket.off("player_skin_updated", onPlayerSkinUpdated);
  };
}

const STEP_DURATION = 200; // ms per step
const HIT_VISUAL_DELAY_MS = 100;
const HIT_STOP_MS = 0;

function runAnimation(payload: PathsRevealPayload): void {
  const { redPath, bluePath, redStart, blueStart, collisions } = payload;
  const store = useGameStore.getState;

  const redSeq = [redStart, ...redPath];
  const blueSeq = [blueStart, ...bluePath];
  const maxSteps = Math.max(redSeq.length, blueSeq.length);

  // Track collisions by step
  const collisionMap = new Map<number, (typeof collisions)[0]>();
  for (const c of collisions) collisionMap.set(c.step, c);

  let step = 0;
  const tick = () => {
    if (step >= maxSteps) {
      store().finishAnimation();
      return;
    }

    const newRed = redSeq[Math.min(step, redSeq.length - 1)];
    const newBlue = blueSeq[Math.min(step, blueSeq.length - 1)];
    useGameStore.setState({ redDisplayPos: newRed, blueDisplayPos: newBlue });

    const collision = collisionMap.get(step);
    if (collision) {
      const escapee = collision.escapeeColor;
      const attackerColor = escapee === "red" ? "blue" : "red";
      const attackerSeq = attackerColor === "red" ? redSeq : blueSeq;
      const cur = attackerSeq[Math.min(step, attackerSeq.length - 1)];
      const prev =
        attackerSeq[Math.min(Math.max(step - 1, 0), attackerSeq.length - 1)];
      const direction = { dx: cur.col - prev.col, dy: cur.row - prev.row };

      const gs = store().gameState;
      if (gs) {
        useGameStore.setState({
          gameState: {
            ...gs,
            players: {
              ...gs.players,
              [escapee]: { ...gs.players[escapee], hp: collision.newHp },
            },
          },
        });
      }

      window.setTimeout(() => {
        store().triggerHit(escapee);
        store().triggerCollisionEffect(collision.position, direction);
        const prevHp = collision.newHp + 1;
        store().triggerHeartShake(escapee, prevHp - 1);
        if (!store().isSfxMuted) playHit(store().sfxVolume);
        if (collision.newHp <= 0) {
          store().triggerExplosion(escapee);
        }
      }, HIT_VISUAL_DELAY_MS);
    }

    step++;
    setTimeout(tick, STEP_DURATION + (collision ? HIT_STOP_MS : 0));
  };

  setTimeout(tick, STEP_DURATION);
}
