import { useId } from 'react';
import type { Position, PlayerColor } from '../../types/game.types';

interface Props {
  color: PlayerColor;
  path: Position[];
  startPos: Position;
  cellSize: number;
  isPlanning?: boolean;
  animateReveal?: boolean;
  muted?: boolean;
}

export function PathLine({
  color,
  path,
  startPos,
  cellSize,
  isPlanning = false,
  animateReveal = false,
  muted = false,
}: Props) {
  const glowId = useId();

  if (path.length === 0) return null;

  const allPoints = [startPos, ...path];
  const points = allPoints
    .map(
      (p) =>
        `${p.col * cellSize + cellSize / 2},${p.row * cellSize + cellSize / 2}`,
    )
    .join(' ');

  const isRed = color === 'red';
  const strokeWidth = isRed
    ? Math.max(4, cellSize * 0.085)
    : Math.max(3, cellSize * 0.055);
  const stroke = isRed ? '#ef4444' : '#3b82f6';
  const opacity = muted ? 0.24 : isRed ? 0.7 : 0.85;
  const zIndex = muted ? 1 : isRed ? 2 : 3;
  const outlineStroke = isRed
    ? 'rgba(84, 12, 18, 0.92)'
    : 'rgba(8, 30, 76, 0.92)';
  const outlineWidth = strokeWidth + Math.max(4, cellSize * 0.042);
  const glowWidth = strokeWidth + Math.max(8, cellSize * 0.09);
  const glowOpacity = muted ? 0.12 : isRed ? 0.48 : 0.55;
  const innerHighlight = isRed ? '#fecaca' : '#bfdbfe';
  const endRadius = isRed
    ? Math.max(4, cellSize * 0.072)
    : Math.max(3, cellSize * 0.052);
  const strokeDasharray = muted
    ? `${strokeWidth * 1.2} ${strokeWidth * 1.35}`
    : isPlanning
    ? `${strokeWidth * 2} ${strokeWidth * 1.5}`
    : undefined;
  const endX = path[path.length - 1].col * cellSize + cellSize / 2;
  const endY = path[path.length - 1].row * cellSize + cellSize / 2;

  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex,
        overflow: 'visible',
      }}
      className={animateReveal ? 'path-line path-line-reveal' : 'path-line'}
      width="100%"
      height="100%"
    >
      <defs>
        <filter
          id={glowId}
          x="-35%"
          y="-35%"
          width="170%"
          height="170%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur
            stdDeviation={Math.max(2, cellSize * 0.035)}
            result="blur"
          />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <polyline
        points={points}
        fill="none"
        stroke={stroke}
        strokeWidth={glowWidth}
        strokeOpacity={glowOpacity}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={strokeDasharray}
        filter={`url(#${glowId})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={outlineStroke}
        strokeWidth={outlineWidth}
        strokeOpacity={muted ? 0.28 : 0.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={strokeDasharray}
      />
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
      <polyline
        points={points}
        fill="none"
        stroke={innerHighlight}
        strokeWidth={Math.max(1.4, strokeWidth * 0.28)}
        strokeOpacity={muted ? 0.16 : isRed ? 0.35 : 0.42}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray={strokeDasharray}
      />
      <circle
        cx={endX}
        cy={endY}
        r={endRadius + Math.max(5, cellSize * 0.055)}
        fill={stroke}
        fillOpacity={glowOpacity}
        filter={`url(#${glowId})`}
      />
      <circle
        cx={endX}
        cy={endY}
        r={endRadius + Math.max(2, cellSize * 0.025)}
        fill={outlineStroke}
        fillOpacity={muted ? 0.3 : 0.95}
      />
      <circle cx={endX} cy={endY} r={endRadius} fill={stroke} fillOpacity={opacity} />
    </svg>
  );
}
