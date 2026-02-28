import { useGameStore } from '../../store/gameStore';
import type { PlayerColor } from '../../types/game.types';
import './HpDisplay.css';

interface Props {
  color: PlayerColor;
  hp: number;
  myColor: PlayerColor;
}

const MAX_HP = 3;

export function HpDisplay({ color, hp, myColor }: Props) {
  const { heartShake } = useGameStore();
  const isMe = color === myColor;
  const label = color === 'red' ? 'Red HP' : 'Blue HP';

  return (
    <div className="hp-display">
      <span className={`hp-label ${isMe ? 'bold' : ''}`}>{label}</span>
      <div className="hearts">
        {Array.from({ length: MAX_HP }, (_, i) => {
          const filled = i < hp;
          const isShaking = heartShake[color] === i;
          return (
            <span
              key={i}
              className={`heart ${filled ? 'filled' : 'empty'} ${isShaking ? 'shaking' : ''}`}
            >
              {filled ? '♥' : '♡'}
            </span>
          );
        })}
      </div>
    </div>
  );
}
