import "./preview.css";

const INNER_TICK_ANGLES = Array.from({ length: 8 }, (_, i) => i * 45);
const MID_TICK_ANGLES = Array.from({ length: 12 }, (_, i) => i * 30);
const OUTER_TICK_ANGLES = Array.from({ length: 16 }, (_, i) => i * 22.5);
const ORBIT_DELAYS = [0, -1.75, -3.5, -5.25];
const STAR_DELAYS = [0, -4.67, -9.33];

export function ChronosPreview() {
  return (
    <span className="chronos-preview-scale" aria-hidden="true">
      <span className="chronos-preview-wrap">
        <span className="chronos-preview-body">
          <span className="chronos-preview-core" />
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
