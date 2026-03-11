import { useId } from "react";

export type FlagId = "flag_kr" | "flag_jp" | "flag_cn" | "flag_us" | "flag_uk";

const FLAG_IDS: readonly FlagId[] = [
  "flag_kr",
  "flag_jp",
  "flag_cn",
  "flag_us",
  "flag_uk",
];

export function isFlagSkin(skin: string): skin is FlagId {
  return FLAG_IDS.includes(skin as FlagId);
}

/** Compute polygon points for a 5-pointed star */
function starPoints(cx: number, cy: number, R: number, r: number): string {
  return Array.from({ length: 10 }, (_, i) => {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const rad = i % 2 === 0 ? R : r;
    return `${(cx + rad * Math.cos(a)).toFixed(2)},${(cy + rad * Math.sin(a)).toFixed(2)}`;
  }).join(" ");
}

// Precompute Chinese flag star polygon points (viewBox 0 0 100 100)
const CN_BIG = starPoints(24, 27, 17, 7);
const CN_SM_1 = starPoints(43, 15, 6, 2.5);
const CN_SM_2 = starPoints(51, 24, 6, 2.5);
const CN_SM_3 = starPoints(51, 35, 6, 2.5);
const CN_SM_4 = starPoints(43, 44, 6, 2.5);

const SVG_STYLE: React.CSSProperties = {
  display: "block",
  width: "100%",
  height: "100%",
};

export function FlagSkin({ id }: { id: FlagId }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");

  const svgBase = { viewBox: "0 0 100 100", style: SVG_STYLE } as const;

  if (id === "flag_jp") {
    return (
      <svg {...svgBase}>
        <rect width="100" height="100" fill="white" />
        <circle cx="50" cy="50" r="30" fill="#BC002D" />
      </svg>
    );
  }

  if (id === "flag_kr") {
    return (
      <svg {...svgBase}>
        {/* White background */}
        <rect width="100" height="100" fill="white" />
        {/* Taeguk: top red swirl */}
        <path
          d="
            M 50 22
            A 28 28 0 0 1 50 78
            A 14 14 0 0 0 50 50
            A 14 14 0 0 1 50 22
            Z
          "
          fill="#CD2E3A"
          transform="rotate(-60 50 50)"
        />
        {/* Taeguk: bottom blue swirl */}
        <path
          d="
            M 50 78
            A 28 28 0 0 1 50 22
            A 14 14 0 0 0 50 50
            A 14 14 0 0 1 50 78
            Z
          "
          fill="#003478"
          transform="rotate(-60 50 50)"
        />
        {/* ── Trigrams ── */}
        {/* 건 (☰) NW — 3 solid bars */}
        <g transform="translate(24,24) rotate(-45)">
          <rect x="-8" y="-6" width="16" height="2.5" fill="#000" />
          <rect x="-8" y="-1" width="16" height="2.5" fill="#000" />
          <rect x="-8" y="4" width="16" height="2.5" fill="#000" />
        </g>
        {/* 이 (☲) NE — solid · broken · solid */}
        <g transform="translate(76,24) rotate(45)">
          <rect x="-8" y="-6" width="16" height="2.5" fill="#000" />
          <rect x="-8" y="-1" width="6" height="2.5" fill="#000" />
          <rect x="2" y="-1" width="6" height="2.5" fill="#000" />
          <rect x="-8" y="4" width="16" height="2.5" fill="#000" />
        </g>
        {/* 감 (☵) SW — broken · solid · broken */}
        <g transform="translate(24,76) rotate(-135)">
          <rect x="-8" y="-6" width="6" height="2.5" fill="#000" />
          <rect x="2" y="-6" width="6" height="2.5" fill="#000" />
          <rect x="-8" y="-1" width="16" height="2.5" fill="#000" />
          <rect x="-8" y="4" width="6" height="2.5" fill="#000" />
          <rect x="2" y="4" width="6" height="2.5" fill="#000" />
        </g>
        {/* 곤 (☷) SE — 3 broken bars */}
        <g transform="translate(76,76) rotate(135)">
          <rect x="-8" y="-6" width="6" height="2.5" fill="#000" />
          <rect x="2" y="-6" width="6" height="2.5" fill="#000" />
          <rect x="-8" y="-1" width="6" height="2.5" fill="#000" />
          <rect x="2" y="-1" width="6" height="2.5" fill="#000" />
          <rect x="-8" y="4" width="6" height="2.5" fill="#000" />
          <rect x="2" y="4" width="6" height="2.5" fill="#000" />
        </g>
      </svg>
    );
  }

  if (id === "flag_cn") {
    return (
      <svg {...svgBase}>
        <rect width="100" height="100" fill="#DE2910" />
        {/* Large star */}
        <polygon points={CN_BIG} fill="#FFDE00" />
        {/* 4 small stars */}
        <polygon points={CN_SM_1} fill="#FFDE00" />
        <polygon points={CN_SM_2} fill="#FFDE00" />
        <polygon points={CN_SM_3} fill="#FFDE00" />
        <polygon points={CN_SM_4} fill="#FFDE00" />
      </svg>
    );
  }

  if (id === "flag_us") {
    const stripeH = 100 / 13;
    const cantonH = 7 * stripeH; // covers 7 stripes tall
    // Representative star dots in canton (4 rows alternating 4 and 3)
    const dots: { cx: number; cy: number }[] = [];
    for (let row = 0; row < 6; row++) {
      const isEven = row % 2 === 0;
      const cols = isEven ? 4 : 3;
      const xStart = isEven ? 4.5 : 9;
      for (let col = 0; col < cols; col++) {
        dots.push({ cx: xStart + col * 9, cy: 4.5 + row * (cantonH / 6) });
      }
    }
    return (
      <svg {...svgBase}>
        {Array.from({ length: 13 }, (_, i) => (
          <rect
            key={i}
            x="0"
            y={i * stripeH}
            width="100"
            height={stripeH + 0.3}
            fill={i % 2 === 0 ? "#B22234" : "white"}
          />
        ))}
        {/* Blue canton */}
        <rect x="0" y="0" width="40" height={cantonH} fill="#3C3B6E" />
        {/* White star dots */}
        {dots.map((d, i) => (
          <circle key={i} cx={d.cx} cy={d.cy} r="1.9" fill="white" />
        ))}
      </svg>
    );
  }

  if (id === "flag_uk") {
    // Union Jack: counterchanged St Patrick's cross
    const d = 3.54; // 5px offset along perpendicular to diagonal
    const t = `${uid}t`,
      r2 = `${uid}r`,
      b = `${uid}b`,
      l = `${uid}l`;
    return (
      <svg {...svgBase}>
        <defs>
          {/* 4 triangular clip regions (top/right/bottom/left of center) */}
          <clipPath id={t}>
            <polygon points="0,0 100,0 50,50" />
          </clipPath>
          <clipPath id={r2}>
            <polygon points="100,0 100,100 50,50" />
          </clipPath>
          <clipPath id={b}>
            <polygon points="100,100 0,100 50,50" />
          </clipPath>
          <clipPath id={l}>
            <polygon points="0,100 0,0 50,50" />
          </clipPath>
        </defs>
        {/* Blue background */}
        <rect width="100" height="100" fill="#012169" />
        {/* St Andrew: broad white diagonals */}
        <line x1="0" y1="0" x2="100" y2="100" stroke="white" strokeWidth="22" />
        <line x1="100" y1="0" x2="0" y2="100" stroke="white" strokeWidth="22" />
        {/* St Patrick: counterchanged red diagonals (offset per quadrant) */}
        {/* \\ diagonal: shift "upper-left" in top+left quadrants */}
        <line
          x1={-d}
          y1={d}
          x2={100 - d}
          y2={100 + d}
          stroke="#C8102E"
          strokeWidth="8"
          clipPath={`url(#${t})`}
        />
        <line
          x1={-d}
          y1={d}
          x2={100 - d}
          y2={100 + d}
          stroke="#C8102E"
          strokeWidth="8"
          clipPath={`url(#${l})`}
        />
        {/* \\ diagonal: shift "lower-right" in right+bottom quadrants */}
        <line
          x1={d}
          y1={-d}
          x2={100 + d}
          y2={100 - d}
          stroke="#C8102E"
          strokeWidth="8"
          clipPath={`url(#${r2})`}
        />
        <line
          x1={d}
          y1={-d}
          x2={100 + d}
          y2={100 - d}
          stroke="#C8102E"
          strokeWidth="8"
          clipPath={`url(#${b})`}
        />
        {/* // diagonal: counterchanged opposite way */}
        <line
          x1={100 + d}
          y1={d}
          x2={d}
          y2={100 + d}
          stroke="#C8102E"
          strokeWidth="8"
          clipPath={`url(#${t})`}
        />
        <line
          x1={100 + d}
          y1={d}
          x2={d}
          y2={100 + d}
          stroke="#C8102E"
          strokeWidth="8"
          clipPath={`url(#${r2})`}
        />
        <line
          x1={100 - d}
          y1={-d}
          x2={-d}
          y2={100 - d}
          stroke="#C8102E"
          strokeWidth="8"
          clipPath={`url(#${b})`}
        />
        <line
          x1={100 - d}
          y1={-d}
          x2={-d}
          y2={100 - d}
          stroke="#C8102E"
          strokeWidth="8"
          clipPath={`url(#${l})`}
        />
        {/* St George: broad white cross */}
        <rect x="38" y="0" width="24" height="100" fill="white" />
        <rect x="0" y="38" width="100" height="24" fill="white" />
        {/* St George: narrow red cross */}
        <rect x="43.5" y="0" width="13" height="100" fill="#C8102E" />
        <rect x="0" y="43.5" width="100" height="13" fill="#C8102E" />
      </svg>
    );
  }

  return null;
}
