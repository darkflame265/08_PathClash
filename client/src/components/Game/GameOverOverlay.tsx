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
  allowRematch?: boolean;
  actionLabel?: string | null;
  onAction?: (() => void) | null;
  alignActionRight?: boolean;
  showActionWithRematch?: boolean;
  rematchButtonTone?: "green" | "blue";
}

export function GameOverOverlay({
  winner,
  myColor,
  rewardTokens = null,
  allowRematch = true,
  actionLabel = null,
  onAction = null,
  alignActionRight = false,
  showActionWithRematch = false,
  rematchButtonTone = "green",
}: Props) {
  const { t } = useLang();
  const { rematchRequested, rematchRequestSent, gameOverMessage, setRematchRequestSent } = useGameStore();
  const isWinner = winner === myColor;
  const showRematch =
    allowRematch &&
    !gameOverMessage &&
    (!actionLabel || showActionWithRematch);
  const showAction = !gameOverMessage && actionLabel && onAction;
  const rewardAmount =
    isWinner && rewardTokens && rewardTokens > 0 ? rewardTokens : null;

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

        {rewardAmount && (
          <div className="gameover-reward">
            <span
              className="gameover-token-icon skin-token-icon"
              aria-hidden="true"
            >
              {"💎"}
            </span>
            <span className="gameover-value">+{rewardAmount}</span>
          </div>
        )}

        {rematchRequested && (
          <div className="rematch-notice">{t.rematchRequested}</div>
        )}

        {rematchRequestSent && (
          <div className="rematch-notice">{t.rematchSent}</div>
        )}

        {showAction && (
          <button
            className={`rematch-btn${alignActionRight ? ' gameover-action-right' : ''}`}
            onClick={onAction}
          >
            {actionLabel}
          </button>
        )}

        {showRematch && (
          <button
            className={`rematch-btn${
              rematchButtonTone === "blue" ? " rematch-btn-blue" : ""
            }`}
            onClick={handleRematch}
          >
            {t.rematchBtn}
          </button>
        )}
      </div>
    </div>
  );
}
