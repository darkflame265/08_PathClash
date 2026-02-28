import { useGameStore } from '../../store/gameStore';
import type { PlayerColor } from '../../types/game.types';
import { getSocket } from '../../socket/socketClient';
import './GameOverOverlay.css';

interface Props {
  winner: PlayerColor;
  myColor: PlayerColor;
}

export function GameOverOverlay({ winner, myColor }: Props) {
  const { rematchRequested } = useGameStore();
  const isWinner = winner === myColor;

  const handleRematch = () => {
    getSocket().emit('request_rematch');
  };

  return (
    <div className="gameover-overlay">
      <div className="gameover-box">
        <div className={`gameover-result ${isWinner ? 'win' : 'lose'}`}>
          {isWinner ? '✨ YOU WIN! ✨' : '💀 YOU LOSE'}
        </div>

        {rematchRequested && (
          <div className="rematch-notice">상대방이 재시합을 요청하였습니다</div>
        )}

        <button className="rematch-btn" onClick={handleRematch}>
          REMATCH
        </button>
      </div>
    </div>
  );
}
