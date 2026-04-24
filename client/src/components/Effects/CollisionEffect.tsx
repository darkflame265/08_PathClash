import type { Position } from '../../types/game.types';
import './CollisionEffect.css';

interface Props {
  position: Position;
  cellSize: number;
  direction?: { dx: number; dy: number };
}

const SPARK_LETTERS = ['a', 'b', 'c', 'd', 'e'] as const;
const DIRECTIONAL_OFFSETS = [0, 15, -15, 30, -30];

export function CollisionEffect({ position, cellSize, direction }: Props) {
  const x = position.col * cellSize + cellSize / 2;
  const y = position.row * cellSize + cellSize / 2;
  const effectSize = Math.max(52, Math.round(cellSize * 1.3));

  const primaryAngle =
    direction && (direction.dx !== 0 || direction.dy !== 0)
      ? Math.atan2(direction.dx, -direction.dy) * (180 / Math.PI)
      : null;

  return (
    <div
      className={`collision-effect${primaryAngle !== null ? ' collision-effect--directional' : ''}`}
      style={{
        left: x,
        top: y,
        width: effectSize,
        height: effectSize,
        transform: 'translate(-50%, -50%)',
        ...(primaryAngle !== null
          ? ({ '--primary-angle': `${primaryAngle}deg` } as React.CSSProperties)
          : {}),
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
