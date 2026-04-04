import { useGameStore } from '../../store/gameStore';
import type { PlayerColor } from '../../types/game.types';
import './HpDisplay.css';

interface Props {
  color: PlayerColor;
  hp: number;
  myColor: PlayerColor;
  maxHp?: number;
  healedHeartIndex?: number | null;
}

export function HpDisplay({
  color,
  hp,
  myColor,
  maxHp = 3,
  healedHeartIndex = null,
}: Props) {
  const { heartShake } = useGameStore();
  const isMe = color === myColor;
  const label = color === 'red' ? 'Red HP' : 'Blue HP';

  return (
    <div className="hp-display">
      <span className={`hp-label ${isMe ? 'bold' : ''}`}>{label}</span>
      <div className="hearts">
        {Array.from({ length: maxHp }, (_, i) => {
          const filled = i < hp;
          const isShaking = heartShake[color] === i;
          const isHealing = healedHeartIndex === i;
          return (
            <span
              key={i}
              className={`heart ${filled ? 'filled' : 'empty'} ${isShaking ? 'shaking' : ''} ${isHealing ? 'healing' : ''}`}
            >
              {filled ? '♥' : '♡'}
            </span>
          );
        })}
      </div>
    </div>
  );
}
