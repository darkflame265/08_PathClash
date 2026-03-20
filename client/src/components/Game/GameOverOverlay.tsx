import { useEffect } from 'react';
import { useGameStore } from '../../store/gameStore';
import type { PlayerColor } from '../../types/game.types';
import { getSocket } from '../../socket/socketClient';
import { useLang } from '../../hooks/useLang';
import './GameOverOverlay.css';

interface Props {
  winner: PlayerColor;
  myColor: PlayerColor;
  rewardTokens?: number | null;
}

export function GameOverOverlay({ winner, myColor, rewardTokens = null }: Props) {
  const { t, lang } = useLang();
  const { rematchRequested, rematchRequestSent, gameOverMessage, setRematchRequestSent } = useGameStore();
  const isWinner = winner === myColor;
  const showRematch = !gameOverMessage;
  const rewardCopy =
    isWinner && rewardTokens && rewardTokens > 0
      ? lang === 'en'
        ? `+${rewardTokens} Tokens`
        : `+${rewardTokens} 토큰 획득`
      : null;

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
          {isWinner ? t.youWin : t.youLose}
        </div>

        {gameOverMessage && (
          <div className="gameover-message">{gameOverMessage}</div>
        )}

        {rewardCopy && <div className="gameover-reward">{rewardCopy}</div>}

        {rematchRequested && (
          <div className="rematch-notice">{t.rematchRequested}</div>
        )}

        {rematchRequestSent && (
          <div className="rematch-notice">{t.rematchSent}</div>
        )}

        {showRematch && (
          <button className="rematch-btn" onClick={handleRematch}>
            {t.rematchBtn}
          </button>
        )}
      </div>
    </div>
  );
}
