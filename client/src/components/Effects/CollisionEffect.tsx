import type { Position } from '../../types/game.types';
import './CollisionEffect.css';

interface Props {
  position: Position;
  cellSize: number;
  direction?: { dx: number; dy: number };
}

const SPARK_LETTERS = ['a', 'b', 'c', 'd', 'e', 'f'] as const;
const DIRECTIONAL_OFFSETS = [0, 30, -30, 60, -60, 180];

export function CollisionEffect({ position, cellSize, direction }: Props) {
  const x = position.col * cellSize + cellSize / 2;
  const y = position.row * cellSize + cellSize / 2;
  const effectSize = Math.max(34, Math.round(cellSize * 0.72));

  const hasDirection = direction && (direction.dx !== 0 || direction.dy !== 0);
  const primaryAngle = hasDirection
    ? Math.atan2(direction!.dy, direction!.dx) * (180 / Math.PI)
    : null;

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
    >
      <span className="collision-effect-core" />
      {SPARK_LETTERS.map((letter, i) => (
        <span
          key={letter}
          className={`collision-effect-spark collision-effect-spark-${letter}`}
          style={
            primaryAngle !== null
              ? ({ '--spark-rotate': `${primaryAngle + DIRECTIONAL_OFFSETS[i]}deg` } as React.CSSProperties)
              : undefined
          }
        />
      ))}
    </div>
  );
}
