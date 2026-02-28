import type { Position, PlayerColor } from '../../types/game.types';
import './PlayerPiece.css';

interface Props {
  color: PlayerColor;
  position: Position;
  cellSize: number;
  isAttacker: boolean;
  isHit: boolean;
  isExploding: boolean;
}

export function PlayerPiece({ color, position, cellSize, isAttacker, isHit, isExploding }: Props) {
  const x = position.col * cellSize + cellSize / 2;
  const y = position.row * cellSize + cellSize / 2;

  const classes = [
    'player-piece',
    `piece-${color}`,
    isHit ? 'hit' : '',
    isExploding ? 'exploding' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      style={{
        transform: `translate(${x}px, ${y}px) translate(-50%, -50%)`,
      }}
    >
      {isAttacker && <div className={`attacker-glow glow-${color}`} />}
      <div className="piece-inner" />
    </div>
  );
}
