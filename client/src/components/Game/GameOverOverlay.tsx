import { useEffect, useState } from 'react';
import { useGameStore } from '../../store/gameStore';
import type { PlayerColor } from '../../types/game.types';
import { getSocket } from '../../socket/socketClient';
import './GameOverOverlay.css';

interface Props {
  winner: PlayerColor;
  myColor: PlayerColor;
}

export function GameOverOverlay({ winner, myColor }: Props) {
  const { rematchRequested, gameOverMessage } = useGameStore();
  const isWinner = winner === myColor;
  const showRematch = !gameOverMessage;
  const [requestSent, setRequestSent] = useState(false);

  useEffect(() => {
    setRequestSent(false);
  }, [winner, gameOverMessage]);

  const handleRematch = () => {
    getSocket().emit('request_rematch');
    setRequestSent(true);
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

        {requestSent && (
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
