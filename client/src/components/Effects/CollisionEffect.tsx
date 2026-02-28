import type { Position } from '../../types/game.types';
import './CollisionEffect.css';

interface Props {
  position: Position;
  cellSize: number;
}

export function CollisionEffect({ position, cellSize }: Props) {
  const x = position.col * cellSize + cellSize / 2;
  const y = position.row * cellSize + cellSize / 2;
  const effectSize = Math.max(34, Math.round(cellSize * 0.72));

  return (
    <div
      className="collision-effect"
      style={{
        left: x,
        top: y,
        width: effectSize,
        height: effectSize,
        transform: 'translate(-50%, -50%)',
      }}
    />
  );
}
