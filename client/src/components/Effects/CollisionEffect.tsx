import type { Position } from '../../types/game.types';
import './CollisionEffect.css';

interface Props {
  position: Position;
  cellSize: number;
}

export function CollisionEffect({ position, cellSize }: Props) {
  const x = position.col * cellSize + cellSize / 2;
  const y = position.row * cellSize + cellSize / 2;

  return (
    <div
      className="collision-effect"
      style={{ left: x, top: y, transform: 'translate(-50%, -50%)' }}
    />
  );
}
