import { useEffect, useState } from "react";
import "./game.css";

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

function getClockAngles() {
  const now = new Date();
  const sec = now.getSeconds();
  const min = now.getMinutes();
  const hour = now.getHours() % 12;

  return {
    second: sec * 6,
    minute: min * 6 + sec * 0.1,
    hour: hour * 30 + min * 0.5,
  };
}

export function ChronosGame() {
  const [angles, setAngles] = useState(getClockAngles);

  useEffect(() => {
    const update = () => setAngles(getClockAngles());
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div className="chronos-scale" aria-hidden="true">
      <div className="chronos-wrap">
        <div className="chronos-body">
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
          {ROMAN_NUMERALS.map(({ label, angle }) => {
            const rad = (angle * Math.PI) / 180;
            const x = BODY_CENTER + NUMERAL_RADIUS * Math.sin(rad);
            const y = BODY_CENTER - NUMERAL_RADIUS * Math.cos(rad);
            return (
              <div
                key={label}
                className="chronos-numeral"
                style={{ left: `${x}px`, top: `${y}px` }}
              >
                {label}
              </div>
            );
          })}
          <div
            className="chronos-hand chronos-hand-hour"
            style={{ transform: `rotate(${angles.hour}deg)` }}
          />
          <div
            className="chronos-hand chronos-hand-minute"
            style={{ transform: `rotate(${angles.minute}deg)` }}
          />
          <div
            className="chronos-hand chronos-hand-second"
            style={{ transform: `rotate(${angles.second}deg)` }}
          />
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
