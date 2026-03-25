import type { Position, PlayerColor } from '../../types/game.types';
import { FlagSkin, isFlagSkin } from '../shared/FlagSkin';
import { CosmicGame } from '../../skins/rare/cosmic/Game';
import { ArcReactorGame } from '../../skins/rare/arc_reactor/Game';
import { AtomicGame } from '../../skins/legendary/atomic/Game';
import { PlasmaGame } from '../../skins/common/plasma/Game';
import { GoldCoreGame } from '../../skins/common/gold_core/Game';
import { NeonPulseGame } from '../../skins/common/neon_pulse/Game';
import { InfernoGame } from '../../skins/common/inferno/Game';
import { QuantumGame } from '../../skins/common/quantum/Game';
import { ElectricCoreGame } from '../../skins/rare/electric_core/Game';
import './PlayerPiece.css';

interface Props {
  color: PlayerColor;
  position: Position;
  cellSize: number;
  isAttacker: boolean;
  isHit: boolean;
  isExploding: boolean;
  isMe: boolean;
  isHidden?: boolean;
  outlineColor?: 'green' | PlayerColor | null;
  skin?:
    | "classic"
    | "ember"
    | "nova"
    | "aurora"
    | "void"
    | "plasma"
    | "gold_core"
    | "neon_pulse"
    | "cosmic"
    | "inferno"
    | "arc_reactor"
    | "electric_core"
    | "quantum"
    | "atomic"
    | "flag_kr"
    | "flag_jp"
    | "flag_cn"
    | "flag_us"
    | "flag_uk";
}

export function PlayerPiece({
  color,
  position,
  cellSize,
  isAttacker,
  isHit,
  isExploding,
  isMe,
  isHidden = false,
  outlineColor = null,
  skin = "classic",
}: Props) {
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
    `piece-skin-${skin}`,
    isMe ? 'piece-me' : '',
    isHidden ? 'piece-hidden' : '',
    outlineColor ? `piece-outline-${outlineColor}` : '',
    isHit ? 'hit' : '',
    isExploding ? 'exploding' : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={classes}
      style={{
        transform: `translate(${x}px, ${y}px) translate(-50%, -50%)`,
        ['--piece-x' as string]: `${x}px`,
        ['--piece-y' as string]: `${y}px`,
        ['--piece-size' as string]: `${pieceSize}px`,
        ['--piece-inner-size' as string]: `${innerSize}px`,
        ['--attacker-inset' as string]: `${-attackerInset}px`,
        ['--me-border-width' as string]: `${meBorder}px`,
        ['--me-glow-width' as string]: `${meGlow}px`,
        ['--piece-glow' as string]: `${pieceGlow}px`,
        ['--arc-reactor-scale' as string]: `${innerSize / 250}`,
      }}
    >
      <div className="piece-visual">
        {isAttacker && <div className={`attacker-glow glow-${color}`} />}
        <div className="piece-inner">
          {isFlagSkin(skin) && <FlagSkin id={skin} />}
          {skin === "plasma" && <PlasmaGame />}
          {skin === "gold_core" && <GoldCoreGame />}
          {skin === "neon_pulse" && <NeonPulseGame />}
          {skin === "cosmic" && <CosmicGame />}
          {skin === "inferno" && <InfernoGame />}
          {skin === "arc_reactor" && <ArcReactorGame />}
          {skin === "electric_core" && <ElectricCoreGame />}
          {skin === "atomic" && <AtomicGame cellSize={cellSize} />}
          {skin === "quantum" && <QuantumGame />}
        </div>
      </div>
    </div>
  );
}
