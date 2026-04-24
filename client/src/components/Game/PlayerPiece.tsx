import { useEffect, useRef, useState } from 'react';
import type { Position, PlayerColor } from '../../types/game.types';
import { FlagSkin, isFlagSkin } from '../shared/FlagSkin';
import { CosmicGame } from '../../skins/rare/cosmic/Game';
import { ArcReactorGame } from '../../skins/rare/arc_reactor/Game';
import { AtomicGame } from '../../skins/legendary/atomic/Game';
import { ChronosGame } from '../../skins/legendary/chronos/Game';
import { SunGame } from '../../skins/legendary/sun/Game';
import { WizardGame } from '../../skins/legendary/wizard/Game';
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
  isGuard?: boolean;
  isAtField?: boolean;
  isOverloaded?: boolean;
  isBlitzing?: boolean;
  isSunChariotActive?: boolean;
  isRewinding?: boolean;
  isMagicMineCasting?: boolean;
  isClone?: boolean;
  hp?: number | null;
  maxHp?: number;
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
    | "chronos"
    | "sun"
    | "wizard"
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
  isGuard = false,
  isAtField = false,
  isOverloaded = false,
  isBlitzing = false,
  isSunChariotActive = false,
  isRewinding = false,
  isMagicMineCasting = false,
  isClone = false,
  hp = null,
  maxHp = 3,
  hpOffsetY = 0,
  outlineColor = null,
  entranceAnimation = null,
  skin = "classic",
}: Props) {
  const effectiveSkin =
    isOverloaded && skin === "neon_pulse" ? "classic" : skin;

  const prevHpRef = useRef(hp);
  const [dyingSegIndex, setDyingSegIndex] = useState<number | null>(null);
  useEffect(() => {
    if (hp === null) return;
    const prev = prevHpRef.current;
    prevHpRef.current = hp;
    if (prev !== null && prev > hp) {
      setDyingSegIndex(hp);
      const t = setTimeout(() => setDyingSegIndex(null), 550);
      return () => clearTimeout(t);
    }
  }, [hp]);

  const x = position.col * cellSize + cellSize / 2;
  const y = position.row * cellSize + cellSize / 2;
  const pieceSize = Math.max(28, Math.round(cellSize * 0.58));
  const innerSize = Math.max(20, Math.round(pieceSize * 0.79));
  const attackerInset = Math.max(8, Math.round(pieceSize * 0.25));
  const meBorder = Math.max(2, Math.round(pieceSize * 0.055));
  const meGlow = Math.max(2, Math.round(pieceSize * 0.055));
  const pieceGlow = Math.max(8, Math.round(pieceSize * 0.22));
  const sunChariotScaleMultiplier = isSunChariotActive ? 6 : 1;
  const arcReactorScale =
    effectiveSkin === 'arc_reactor'
      ? isSunChariotActive
        ? (pieceSize * sunChariotScaleMultiplier) / 210
        : innerSize / 250
      : (innerSize / 250) * sunChariotScaleMultiplier;
  const chronosScale =
    effectiveSkin === 'chronos'
      ? (innerSize / 260) * 0.92 * sunChariotScaleMultiplier
      : (innerSize / 260) * sunChariotScaleMultiplier;
  const wizardScale =
    effectiveSkin === 'wizard'
      ? (innerSize / 250) * 1.2 * sunChariotScaleMultiplier
      : (innerSize / 250) * sunChariotScaleMultiplier;
  const classes = [
    'player-piece',
    `piece-${color}`,
    `piece-skin-${effectiveSkin}`,
    isMe ? 'piece-me' : '',
    isHidden ? 'piece-hidden' : '',
    isPhased ? 'piece-phased' : '',
    isOverloaded ? 'piece-overloaded' : '',
    isBlitzing ? 'piece-blitzing' : '',
    isSunChariotActive ? 'piece-sun-chariot-active' : '',
    isRewinding ? 'piece-rewinding' : '',
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
        ['--arc-reactor-scale' as string]: `${arcReactorScale}`,
        ['--chronos-scale' as string]: `${chronosScale}`,
        ['--wizard-scale' as string]: `${wizardScale}`,
      }}
    >
      {isGuard && (
        <div className="piece-guard-barrier" aria-hidden="true">
          <span className="piece-guard-barrier-dome" />
          <span className="piece-guard-barrier-base" />
          <span className="piece-guard-barrier-cell piece-guard-barrier-cell-a" />
          <span className="piece-guard-barrier-cell piece-guard-barrier-cell-b" />
          <span className="piece-guard-barrier-cell piece-guard-barrier-cell-c" />
          <span className="piece-guard-barrier-cell piece-guard-barrier-cell-d" />
          <span className="piece-guard-barrier-cell piece-guard-barrier-cell-e" />
          <span className="piece-guard-barrier-cell piece-guard-barrier-cell-f" />
          <span className="piece-guard-barrier-cell piece-guard-barrier-cell-g" />
        </div>
      )}
      {isAtField && (
        <div className="piece-at-field" aria-hidden="true">
          <img src="/ui/ability/at_field.svg" className="piece-at-field-svg" alt="" />
        </div>
      )}
      {isMagicMineCasting && (
        <div className="piece-magic-mine-cast" aria-hidden="true">
          <svg viewBox="0 0 100 100" className="piece-magic-mine-cast-svg" style={{ overflow: 'visible' }}>
            <g className="piece-mine-cast-outer">
              <circle cx="50" cy="50" r="46" fill="none" stroke="rgba(200,80,255,0.5)" strokeWidth="1" />
              {Array.from({ length: 12 }).map((_, i) => {
                const a = ((i * 30 - 90) * Math.PI) / 180;
                const major = i % 3 === 0;
                const r1 = major ? 40 : 43;
                return (
                  <line
                    key={i}
                    x1={50 + r1 * Math.cos(a)} y1={50 + r1 * Math.sin(a)}
                    x2={50 + 47 * Math.cos(a)} y2={50 + 47 * Math.sin(a)}
                    stroke={major ? 'rgba(230,110,255,0.9)' : 'rgba(200,80,255,0.6)'}
                    strokeWidth={major ? '1.6' : '0.8'}
                  />
                );
              })}
            </g>
            <g className="piece-mine-cast-hex">
              <polygon points="50,7 87,72 13,72" fill="rgba(150,30,255,0.08)" stroke="rgba(205,85,255,0.85)" strokeWidth="1.5" />
              <polygon points="50,93 87,28 13,28" fill="none" stroke="rgba(220,110,255,0.7)" strokeWidth="1.2" />
            </g>
            <circle cx="50" cy="50" r="22" fill="rgba(140,20,255,0.1)" stroke="rgba(195,75,255,0.7)" strokeWidth="1" />
            <circle cx="50" cy="50" r="5.5" fill="rgba(185,55,255,0.25)" stroke="rgba(235,125,255,0.8)" strokeWidth="1" />
            <circle cx="50" cy="50" r="2.8" fill="rgba(255,215,255,1)" />
          </svg>
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
          {effectiveSkin === "chronos" && <ChronosGame />}
          {effectiveSkin === "sun" && <SunGame cellSize={cellSize} />}
          {effectiveSkin === "wizard" && <WizardGame />}
          {effectiveSkin === "quantum" && <QuantumGame />}
        </div>
        {hp !== null && !isClone && (
          <div
            className={`piece-hp piece-hp-${color}${isMe ? ' piece-hp-me' : ''}`}
            style={{ ['--piece-hp-offset-y' as string]: `${hpOffsetY}px` }}
            aria-hidden="true"
          >
            {Array.from({ length: maxHp }, (_, index) => {
              const filled = index < hp;
              const dying = dyingSegIndex === index;
              return (
                <span
                  key={index}
                  className={`piece-hp-seg${filled ? " is-filled" : dying ? " is-dying" : ""}`}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
