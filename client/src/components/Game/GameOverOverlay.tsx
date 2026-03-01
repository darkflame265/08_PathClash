import { useEffect } from 'react';
import { useGameStore } from '../../store/gameStore';
import type { PlayerColor } from '../../types/game.types';
import { getSocket } from '../../socket/socketClient';
import './GameOverOverlay.css';

interface Props {
  winner: PlayerColor;
  myColor: PlayerColor;
}

export function GameOverOverlay({ winner, myColor }: Props) {
  const { rematchRequested, rematchRequestSent, gameOverMessage, setRematchRequestSent } = useGameStore();
  const isWinner = winner === myColor;
  const showRematch = !gameOverMessage;

  useEffect(() => {
    setRematchRequestSent(false);
  }, [gameOverMessage, setRematchRequestSent, winner]);

  const handleRematch = () => {
    getSocket().emit('request_rematch');
    setRematchRequestSent(true);
  };

  return (
    <div className="gameover-overlay">
      <div className="gameover-box">
        <div className={`gameover-result ${isWinner ? 'win' : 'lose'}`}>
          {isWinner ? 'YOU WIN!' : 'YOU LOSE'}
        </div>

        {gameOverMessage && (
          <div className="gameover-message">{gameOverMessage}</div>
        )}

        {rematchRequested && (
          <div className="rematch-notice">Opponent requested a rematch.</div>
        )}

        {rematchRequestSent && (
          <div className="rematch-notice">Rematch request sent.</div>
        )}

        {showRematch && (
          <button className="rematch-btn" onClick={handleRematch}>
            REMATCH
          </button>
        )}
      </div>
    </div>
  );
}
