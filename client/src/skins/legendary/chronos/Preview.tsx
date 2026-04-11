import "./preview.css";

const INNER_TICK_ANGLES = Array.from({ length: 8 }, (_, i) => i * 45);
const MID_TICK_ANGLES = Array.from({ length: 12 }, (_, i) => i * 30);
const OUTER_TICK_ANGLES = Array.from({ length: 16 }, (_, i) => i * 22.5);
const ORBIT_DELAYS = [0, -1.75, -3.5, -5.25];
const STAR_DELAYS = [0, -4.67, -9.33];

const ROMAN_NUMERALS = [
  { label: "XII", angle: 0 },
  { label: "I", angle: 30 },
  { label: "II", angle: 60 },
  { label: "III", angle: 90 },
  { label: "IV", angle: 120 },
  { label: "V", angle: 150 },
  { label: "VI", angle: 180 },
  { label: "VII", angle: 210 },
  { label: "VIII", angle: 240 },
  { label: "IX", angle: 270 },
  { label: "X", angle: 300 },
  { label: "XI", angle: 330 },
];
const NUMERAL_RADIUS = 103;
const BODY_CENTER = 130;

export function ChronosPreview() {
  return (
    <span className="chronos-preview-scale" aria-hidden="true">
      <span className="chronos-preview-wrap">
        <span className="chronos-preview-body">
          <span className="chronos-preview-ring chronos-preview-ring-inner">
            {INNER_TICK_ANGLES.map((angle) => (
              <span
                key={`inner-${angle}`}
                className="chronos-preview-tick chronos-preview-tick-inner"
                style={{ ["--chronos-tick-angle" as string]: `${angle}deg` }}
              />
            ))}
          </span>
          <span className="chronos-preview-ring chronos-preview-ring-mid">
            {MID_TICK_ANGLES.map((angle) => (
              <span
                key={`mid-${angle}`}
                className="chronos-preview-tick chronos-preview-tick-mid"
                style={{ ["--chronos-tick-angle" as string]: `${angle}deg` }}
              />
            ))}
          </span>
          <span className="chronos-preview-ring chronos-preview-ring-outer">
            {OUTER_TICK_ANGLES.map((angle) => (
              <span
                key={`outer-${angle}`}
                className="chronos-preview-tick chronos-preview-tick-outer"
                style={{ ["--chronos-tick-angle" as string]: `${angle}deg` }}
              />
            ))}
          </span>
          {ROMAN_NUMERALS.map(({ label, angle }) => {
            const rad = (angle * Math.PI) / 180;
            const x = BODY_CENTER + NUMERAL_RADIUS * Math.sin(rad);
            const y = BODY_CENTER - NUMERAL_RADIUS * Math.cos(rad);
            return (
              <span
                key={label}
                className="chronos-preview-numeral"
                style={{ left: `${x}px`, top: `${y}px` }}
              >
                {label}
              </span>
            );
          })}
          <span className="chronos-preview-hand chronos-preview-hand-hour" />
          <span className="chronos-preview-hand chronos-preview-hand-minute" />
          <span className="chronos-preview-hand chronos-preview-hand-second" />
          <span className="chronos-preview-pivot" />
          {ORBIT_DELAYS.map((delay, index) => (
            <span
              key={`orb-${index}`}
              className="chronos-preview-orb"
              style={{ ["--chronos-orbit-delay" as string]: `${delay}s` }}
            />
          ))}
          {STAR_DELAYS.map((delay, index) => (
            <span
              key={`star-${index}`}
              className="chronos-preview-star"
              style={{ ["--chronos-star-delay" as string]: `${delay}s` }}
            />
          ))}
        </span>
      </span>
    </span>
  );
}
