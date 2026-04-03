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
  isPhased?: boolean;
  isAtField?: boolean;
  isOverloaded?: boolean;
  isBlitzing?: boolean;
  isClone?: boolean;
  hp?: number | null;
  hpOffsetY?: number;
  outlineColor?: 'green' | PlayerColor | null;
  entranceAnimation?: "left" | "right" | null;
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
  isPhased = false,
  isAtField = false,
  isOverloaded = false,
  isBlitzing = false,
  isClone = false,
  hp = null,
  hpOffsetY = 0,
  outlineColor = null,
  entranceAnimation = null,
  skin = "classic",
}: Props) {
  const effectiveSkin =
    isOverloaded && skin === "neon_pulse" ? "classic" : skin;
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
    `piece-skin-${effectiveSkin}`,
    isMe ? 'piece-me' : '',
    isHidden ? 'piece-hidden' : '',
    isPhased ? 'piece-phased' : '',
    isOverloaded ? 'piece-overloaded' : '',
    isBlitzing ? 'piece-blitzing' : '',
    isClone ? 'piece-clone' : '',
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
      {isAtField && (
        <div className="piece-at-field" aria-hidden="true">
          <span className="piece-at-field-dome" />
          <span className="piece-at-field-base" />
          <span className="piece-at-field-cell piece-at-field-cell-a" />
          <span className="piece-at-field-cell piece-at-field-cell-b" />
          <span className="piece-at-field-cell piece-at-field-cell-c" />
          <span className="piece-at-field-cell piece-at-field-cell-d" />
          <span className="piece-at-field-cell piece-at-field-cell-e" />
          <span className="piece-at-field-cell piece-at-field-cell-f" />
          <span className="piece-at-field-cell piece-at-field-cell-g" />
        </div>
      )}
      <div className={`piece-visual${entranceAnimation ? ` roll-in-${entranceAnimation}` : ""}`}>
        {isAttacker && <div className={`attacker-glow glow-${color}`} />}
        <span className="piece-hit-flash" aria-hidden="true" />
        <div className="piece-inner">
          {isFlagSkin(effectiveSkin) && <FlagSkin id={effectiveSkin} />}
          {effectiveSkin === "plasma" && <PlasmaGame />}
          {effectiveSkin === "gold_core" && <GoldCoreGame />}
          {effectiveSkin === "neon_pulse" && <NeonPulseGame />}
          {effectiveSkin === "cosmic" && <CosmicGame />}
          {effectiveSkin === "inferno" && <InfernoGame />}
          {effectiveSkin === "arc_reactor" && <ArcReactorGame />}
          {effectiveSkin === "electric_core" && <ElectricCoreGame />}
          {effectiveSkin === "atomic" && <AtomicGame cellSize={cellSize} />}
          {effectiveSkin === "quantum" && <QuantumGame />}
        </div>
        {hp !== null && !isClone && (
          <div
            className={`piece-hp piece-hp-${color}${isMe ? ' piece-hp-me' : ''}`}
            style={{ ['--piece-hp-offset-y' as string]: `${hpOffsetY}px` }}
            aria-hidden="true"
          >
            {Array.from({ length: 3 }, (_, index) => (
              <span
                key={index}
                className={`piece-hp-seg${index < hp ? " is-filled" : ""}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
