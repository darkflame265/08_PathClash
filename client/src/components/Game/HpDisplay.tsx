import { useEffect, useRef, useState } from 'react';
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

  const prevHpRef = useRef(hp);
  const [dyingIndex, setDyingIndex] = useState<number | null>(null);

  useEffect(() => {
    const prev = prevHpRef.current;
    prevHpRef.current = hp;
    if (prev > hp) {
      setDyingIndex(hp);
      const t = setTimeout(() => setDyingIndex(null), 600);
      return () => clearTimeout(t);
    }
  }, [hp]);

  return (
    <div className="hp-display">
      <span className={`hp-label ${isMe ? 'bold' : ''}`}>{label}</span>
      <div className="hearts">
        {Array.from({ length: maxHp }, (_, i) => {
          const filled = i < hp;
          const isDying = dyingIndex === i;
          const isShaking = heartShake[color] === i;
          const isHealing = healedHeartIndex === i;
          return (
            <span
              key={i}
              className={`heart ${filled ? 'filled' : isDying ? 'dying' : 'empty'} ${isShaking ? 'shaking' : ''} ${isHealing ? 'healing' : ''}`}
            >
              {filled || isDying ? '♥' : '♡'}
            </span>
          );
        })}
      </div>
    </div>
  );
}
