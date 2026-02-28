import type { Position, PlayerColor } from '../../types/game.types';
import './PlayerPiece.css';

interface Props {
  color: PlayerColor;
  position: Position;
  cellSize: number;
  isAttacker: boolean;
  isHit: boolean;
  isExploding: boolean;
  isMe: boolean;
}

export function PlayerPiece({ color, position, cellSize, isAttacker, isHit, isExploding, isMe }: Props) {
  const x = position.col * cellSize + cellSize / 2;
  const y = position.row * cellSize + cellSize / 2;
  const pieceSize = Math.max(28, Math.round(cellSize * 0.58));
  const innerSize = Math.max(20, Math.round(pieceSize * 0.79));
  const attackerInset = Math.max(8, Math.round(pieceSize * 0.25));
  const meBorder = Math.max(2, Math.round(pieceSize * 0.055));
  const meGlow = Math.max(2, Math.round(pieceSize * 0.055));
  const pieceGlow = Math.max(8, Math.round(pieceSize * 0.22));

  const classes = [
    'player-piece',
    `piece-${color}`,
    isMe ? 'piece-me' : '',
    isHit ? 'hit' : '',
    isExploding ? 'exploding' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      style={{
        transform: `translate(${x}px, ${y}px) translate(-50%, -50%)`,
        ['--piece-size' as string]: `${pieceSize}px`,
        ['--piece-inner-size' as string]: `${innerSize}px`,
        ['--attacker-inset' as string]: `${-attackerInset}px`,
        ['--me-border-width' as string]: `${meBorder}px`,
        ['--me-glow-width' as string]: `${meGlow}px`,
        ['--piece-glow' as string]: `${pieceGlow}px`,
      }}
    >
      {isAttacker && <div className={`attacker-glow glow-${color}`} />}
      <div className="piece-inner" />
    </div>
  );
}
