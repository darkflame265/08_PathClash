/* ═══════════════════════════════════════════════════════════════════
   OLD CODE — 주석 처리 (원래대로 되돌리려면 아래 주석 해제)
   ═══════════════════════════════════════════════════════════════════

import "./game.css";

const ARC_REACTOR_MARKS = Array.from({ length: 60 }, (_, index) => ({
  angle: index * 6,
  delay: -(index % 6) * 0.22,
}));

export function ArcReactorGame() {
  return (
    <div className="arc-reactor-scale" aria-hidden="true">
      <div className="arc_reactor">
        <div className="case_container">
          <div className="e7">
            <div className="semi_arc_3 e5_1">
              <div className="semi_arc_3 e5_2">
                <div className="semi_arc_3 e5_3">
                  <div className="semi_arc_3 e5_4" />
                </div>
              </div>
            </div>
            <div className="core2" />
          </div>
          <ul className="marks">
            {ARC_REACTOR_MARKS.map((mark, index) => (
              <li
                key={`${mark.angle}-${index}`}
                className="arc-reactor-mark"
                style={{
                  ["--mark-angle" as string]: `${mark.angle}deg`,
                  ["--mark-delay" as string]: `${mark.delay}s`,
                }}
              />
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

   ═══════════════════════════════════════════════════════════════════ */

/* ═══════════════════════════════════════════════════════════════════
   NEW: HEXAGON LATTICE
   ═══════════════════════════════════════════════════════════════════ */
import "./game.css";

export function ArcReactorGame() {
  return (
    <div className="arc-reactor-scale" aria-hidden="true">
      <div className="arc-hex-wrap">
        <div className="arc-hex-layer arc-hex-layer-1">
          <svg className="arc-hex-svg" viewBox="0 0 230 230" aria-hidden="true">
            <polygon
              points="115,8 208,60.5 208,169.5 115,222 22,169.5 22,60.5"
              fill="none"
              stroke="rgba(255,150,0,0.6)"
              strokeWidth="2"
              strokeDasharray="14 7"
            />
          </svg>
        </div>
        <div className="arc-hex-layer arc-hex-layer-2">
          <svg className="arc-hex-svg" viewBox="0 0 162 162" aria-hidden="true">
            <polygon
              points="81,6 150,44 150,118 81,156 12,118 12,44"
              fill="none"
              stroke="rgba(255,115,0,0.55)"
              strokeWidth="2"
            />
          </svg>
        </div>
        <div className="arc-hex-layer arc-hex-layer-3">
          <svg className="arc-hex-svg" viewBox="0 0 104 104" aria-hidden="true">
            <polygon
              points="52,4 96,28 96,76 52,100 8,76 8,28"
              fill="none"
              stroke="rgba(255,195,0,0.9)"
              strokeWidth="2.5"
            />
          </svg>
        </div>
        <div className="arc-hex-core" />
      </div>
    </div>
  );
}
