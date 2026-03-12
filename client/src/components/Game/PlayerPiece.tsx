import type { Position, PlayerColor } from '../../types/game.types';
import { FlagSkin, isFlagSkin } from '../shared/FlagSkin';
import './PlayerPiece.css';

const QUANTUM_ORBIT_PARTICLES = [
  { radius: 0.28, angle: 0, duration: 1.45, delay: -0.2 },
  { radius: 0.34, angle: 18, duration: 1.8, delay: -0.8 },
  { radius: 0.4, angle: 42, duration: 2.1, delay: -1.4 },
  { radius: 0.46, angle: 66, duration: 1.65, delay: -0.6 },
  { radius: 0.52, angle: 88, duration: 2.35, delay: -1.9 },
  { radius: 0.58, angle: 110, duration: 1.55, delay: -0.35 },
  { radius: 0.64, angle: 134, duration: 2.6, delay: -2.1 },
  { radius: 0.7, angle: 156, duration: 1.9, delay: -0.95 },
  { radius: 0.76, angle: 182, duration: 2.9, delay: -2.45 },
  { radius: 0.82, angle: 206, duration: 1.72, delay: -0.55 },
  { radius: 0.88, angle: 228, duration: 2.2, delay: -1.3 },
  { radius: 0.94, angle: 250, duration: 1.6, delay: -0.9 },
  { radius: 0.3, angle: 274, duration: 2.45, delay: -1.7 },
  { radius: 0.42, angle: 296, duration: 1.84, delay: -0.42 },
  { radius: 0.54, angle: 318, duration: 2.75, delay: -2.05 },
  { radius: 0.66, angle: 340, duration: 1.68, delay: -0.75 },
  { radius: 0.78, angle: 12, duration: 2.05, delay: -1.1 },
  { radius: 0.9, angle: 140, duration: 2.4, delay: -1.85 },
  { radius: 0.32, angle: 28, duration: 1.58, delay: -0.48 },
  { radius: 0.38, angle: 58, duration: 2.22, delay: -1.52 },
  { radius: 0.48, angle: 96, duration: 1.74, delay: -0.82 },
  { radius: 0.6, angle: 124, duration: 2.48, delay: -1.94 },
  { radius: 0.72, angle: 168, duration: 1.62, delay: -0.64 },
  { radius: 0.84, angle: 214, duration: 2.34, delay: -1.18 },
  { radius: 0.96, angle: 246, duration: 1.92, delay: -1.42 },
  { radius: 0.36, angle: 286, duration: 2.64, delay: -2.14 },
  { radius: 0.5, angle: 312, duration: 1.7, delay: -0.58 },
  { radius: 0.74, angle: 332, duration: 2.16, delay: -1.26 },
  { radius: 0.86, angle: 352, duration: 1.86, delay: -0.88 },
  { radius: 0.62, angle: 154, duration: 2.78, delay: -2.28 },
];

const ARC_REACTOR_MARKS = Array.from({ length: 60 }, (_, index) => ({
  angle: index * 6,
  delay: -(index % 6) * 0.22,
}));

interface Props {
  color: PlayerColor;
  position: Position;
  cellSize: number;
  isAttacker: boolean;
  isHit: boolean;
  isExploding: boolean;
  isMe: boolean;
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
    | "phantom"
    | "arc_reactor"
    | "quantum"
    | "crystal"
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
      }}
    >
      {isAttacker && <div className={`attacker-glow glow-${color}`} />}
      <div className="piece-inner">
        {isFlagSkin(skin) && <FlagSkin id={skin} />}
        {skin === "arc_reactor" && (
          <div className="arc-reactor-field" aria-hidden="true">
            <div className="arc-reactor-ring arc-reactor-ring-outer" />
            <div className="arc-reactor-ring arc-reactor-ring-mid" />
            <div className="arc-reactor-ring arc-reactor-ring-inner" />
            <div className="arc-reactor-core" />
            <div className="arc-reactor-arcs">
              <span className="arc-reactor-arc arc-reactor-arc-a" />
              <span className="arc-reactor-arc arc-reactor-arc-b" />
              <span className="arc-reactor-arc arc-reactor-arc-c" />
            </div>
            <div className="arc-reactor-marks">
              {ARC_REACTOR_MARKS.map((mark, index) => (
                <span
                  key={`${mark.angle}-${index}`}
                  className="arc-reactor-mark"
                  style={{
                    ["--mark-angle" as string]: `${mark.angle}deg`,
                    ["--mark-delay" as string]: `${mark.delay}s`,
                  }}
                />
              ))}
            </div>
          </div>
        )}
        {skin === "crystal" && (
          <div className="crystal-atom" aria-hidden="true">
            <div className="crystal-nucleus" />
            <div className="crystal-electron crystal-electron-1" />
            <div className="crystal-electron crystal-electron-2" />
            <div className="crystal-electron crystal-electron-3" />
          </div>
        )}
        {skin === "quantum" && (
          <div className="quantum-orbit-field" aria-hidden="true">
            {QUANTUM_ORBIT_PARTICLES.map((particle, index) => (
              <span
                key={`${particle.radius}-${particle.angle}-${index}`}
                className={`quantum-orbit quantum-orbit-${index % 3}`}
                style={{
                  ['--orbit-radius' as string]: `${particle.radius}`,
                  ['--orbit-angle' as string]: `${particle.angle}deg`,
                  ['--orbit-duration' as string]: `${particle.duration}s`,
                  ['--orbit-delay' as string]: `${particle.delay}s`,
                }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
