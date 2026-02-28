import { Socket } from 'socket.io-client';
import { useGameStore } from '../store/gameStore';
import type {
  ClientGameState, PathsRevealPayload, RoundStartPayload,
  ChatMessage, PlayerColor,
} from '../types/game.types';
import { playHit } from '../utils/soundUtils';

export function registerSocketHandlers(socket: Socket): () => void {
  const store = useGameStore.getState;

  const onGameStart = (gs: ClientGameState) => {
    store().setGameState(gs);
  };

  const onRoundStart = (payload: RoundStartPayload) => {
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
    const gs = store().gameState;
    if (gs) {
      useGameStore.setState({ gameState: { ...gs, phase: 'gameover' } });
    }
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

  socket.on('game_start', onGameStart);
  socket.on('round_start', onRoundStart);
  socket.on('opponent_submitted', onOpponentSubmitted);
  socket.on('paths_reveal', onPathsReveal);
  socket.on('game_over', onGameOver);
  socket.on('rematch_requested', onRematchRequested);
  socket.on('rematch_start', onRematchStart);
  socket.on('chat_receive', onChatReceive);

  return () => {
    socket.off('game_start', onGameStart);
    socket.off('round_start', onRoundStart);
    socket.off('opponent_submitted', onOpponentSubmitted);
    socket.off('paths_reveal', onPathsReveal);
    socket.off('game_over', onGameOver);
    socket.off('rematch_requested', onRematchRequested);
    socket.off('rematch_start', onRematchStart);
    socket.off('chat_receive', onChatReceive);
  };
}

const STEP_DURATION = 200; // ms per step

function runAnimation(payload: PathsRevealPayload): void {
  const { redPath, bluePath, redStart, blueStart, collisions } = payload;
  const store = useGameStore.getState;

  const redSeq = [redStart, ...redPath];
  const blueSeq = [blueStart, ...bluePath];
  const maxSteps = Math.max(redSeq.length, blueSeq.length);

  // Track collisions by step
  const collisionMap = new Map<number, typeof collisions[0]>();
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
      store().triggerHit(escapee);
      store().triggerCollisionEffect(collision.position);
      const prevHp = collision.newHp + 1;
      store().triggerHeartShake(escapee, prevHp - 1);
      if (!store().isMuted) playHit();

      // Update HP in game state
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

      if (collision.newHp <= 0) {
        store().triggerExplosion(escapee);
      }
    }

    step++;
    setTimeout(tick, STEP_DURATION);
  };

  setTimeout(tick, STEP_DURATION);
}
