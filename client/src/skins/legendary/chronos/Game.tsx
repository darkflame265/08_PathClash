import "./game.css";

const INNER_TICK_ANGLES = Array.from({ length: 8 }, (_, i) => i * 45);
const MID_TICK_ANGLES = Array.from({ length: 12 }, (_, i) => i * 30);
const OUTER_TICK_ANGLES = Array.from({ length: 16 }, (_, i) => i * 22.5);
const ORBIT_DELAYS = [0, -1.75, -3.5, -5.25];
const STAR_DELAYS = [0, -4.67, -9.33];

export function ChronosGame() {
  return (
    <div className="chronos-scale" aria-hidden="true">
      <div className="chronos-wrap">
        <div className="chronos-body">
          <div className="chronos-core" />
          <div className="chronos-ring chronos-ring-inner">
            {INNER_TICK_ANGLES.map((angle) => (
              <div
                key={`inner-${angle}`}
                className="chronos-tick chronos-tick-inner"
                style={{ ["--chronos-tick-angle" as string]: `${angle}deg` }}
              />
            ))}
          </div>
          <div className="chronos-ring chronos-ring-mid">
            {MID_TICK_ANGLES.map((angle) => (
              <div
                key={`mid-${angle}`}
                className="chronos-tick chronos-tick-mid"
                style={{ ["--chronos-tick-angle" as string]: `${angle}deg` }}
              />
            ))}
          </div>
          <div className="chronos-ring chronos-ring-outer">
            {OUTER_TICK_ANGLES.map((angle) => (
              <div
                key={`outer-${angle}`}
                className="chronos-tick chronos-tick-outer"
                style={{ ["--chronos-tick-angle" as string]: `${angle}deg` }}
              />
            ))}
          </div>
          <div className="chronos-hand chronos-hand-hour" />
          <div className="chronos-hand chronos-hand-minute" />
          <div className="chronos-hand chronos-hand-second" />
          <div className="chronos-pivot" />
          {ORBIT_DELAYS.map((delay, index) => (
            <div
              key={`orb-${index}`}
              className="chronos-orb"
              style={{ ["--chronos-orbit-delay" as string]: `${delay}s` }}
            />
          ))}
          {STAR_DELAYS.map((delay, index) => (
            <div
              key={`star-${index}`}
              className="chronos-star"
              style={{ ["--chronos-star-delay" as string]: `${delay}s` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
