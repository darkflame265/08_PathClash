import type { Position, PlayerColor } from '../../types/game.types';

interface Props {
  color: PlayerColor;
  path: Position[];
  startPos: Position;
  cellSize: number;
  isPlanning?: boolean;
}

export function PathLine({ color, path, startPos, cellSize, isPlanning = false }: Props) {
  if (path.length === 0) return null;

  const allPoints = [startPos, ...path];
  const points = allPoints
    .map(p => `${p.col * cellSize + cellSize / 2},${p.row * cellSize + cellSize / 2}`)
    .join(' ');

  const isRed = color === 'red';
  const strokeWidth = isRed ? 8 : 5;
  const stroke = isRed ? '#ef4444' : '#3b82f6';
  const opacity = isRed ? 0.7 : 0.85;
  const zIndex = isRed ? 2 : 3;
  // 경로 지정 단계: 점선 표시 (dasharray = 선길이 공백길이)
  const strokeDasharray = isPlanning ? `${strokeWidth * 2} ${strokeWidth * 1.5}` : undefined;

  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex,
        overflow: 'visible',
      }}
      width="100%"
      height="100%"
    >
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeOpacity={opacity}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={strokeDasharray}
      />
      {/* Arrow at the end */}
      {path.length > 0 && (
        <circle
          cx={path[path.length - 1].col * cellSize + cellSize / 2}
          cy={path[path.length - 1].row * cellSize + cellSize / 2}
          r={isRed ? 7 : 5}
          fill={stroke}
          fillOpacity={opacity}
        />
      )}
    </svg>
  );
}
