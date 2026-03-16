import { useEffect, useRef } from "react";

interface Props {
  className?: string;
  variant?: "game" | "preview";
}

interface StarColor {
  r: number;
  g: number;
  b: number;
}

const PALETTE: StarColor[] = [
  { r: 232, g: 237, b: 242 }, // light gray
  { r: 200, g: 211, b: 224 }, // gray-blue
  { r: 170, g: 188, b: 212 }, // medium gray
  { r: 126, g: 184, b: 247 }, // light blue
  { r: 147, g: 168, b: 232 }, // periwinkle blue
  { r: 181, g: 157, b: 232 }, // soft purple
  { r: 212, g: 184, b: 255 }, // light purple
  { r: 255, g: 255, b: 255 }, // white
];

const RING_CONFIGS = [
  { count: 3, rf: 0.20, baseSpeed: 0.012 },
  { count: 5, rf: 0.39, baseSpeed: 0.007 },
  { count: 6, rf: 0.61, baseSpeed: 0.004 },
  { count: 8, rf: 0.83, baseSpeed: 0.002 },
] as const;

interface Star {
  angle: number;
  rf: number;
  speed: number;
  size: number;
  color: StarColor;
  twinkleBase: number;
  twinkleAmp: number;
  twinkleSpeed: number;
  twinklePhase: number;
}

function buildStars(variant: "game" | "preview"): Star[] {
  const stars: Star[] = [];
  for (const [ringIndex, ring] of RING_CONFIGS.entries()) {
    for (let i = 0; i < ring.count; i++) {
      const baseAngle = (i / ring.count) * Math.PI * 2;
      const isPreview = variant === "preview";
      const jitter = isPreview
        ? 0
        : (Math.random() - 0.5) * (Math.PI / ring.count) * 0.5;
      const colorIndex = isPreview
        ? (ringIndex * 3 + i) % PALETTE.length
        : Math.floor(Math.random() * PALETTE.length);
      stars.push({
        angle: baseAngle + jitter,
        rf: isPreview
          ? ring.rf * 0.92
          : ring.rf + (Math.random() - 0.5) * 0.04,
        speed: isPreview
          ? ring.baseSpeed
          : ring.baseSpeed * (0.8 + Math.random() * 0.4),
        size: isPreview ? 1.1 + (ringIndex % 2) * 0.45 : 0.7 + Math.random() * 1.6,
        color: PALETTE[colorIndex],
        twinkleBase: isPreview ? 0.82 : 0.65 + Math.random() * 0.3,
        twinkleAmp: isPreview ? 0.08 : 0.10 + Math.random() * 0.15,
        twinkleSpeed: isPreview ? 0.03 + ringIndex * 0.006 : 0.025 + Math.random() * 0.035,
        twinklePhase: isPreview ? i * 0.85 + ringIndex * 0.4 : Math.random() * Math.PI * 2,
      });
    }
  }
  return stars;
}

export function CosmicCanvas({ className, variant = "game" }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const stars = buildStars(variant);
    let frameId = 0;
    let t = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = () => {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;

      if (w === 0 || h === 0) {
        frameId = requestAnimationFrame(draw);
        return;
      }

      const cx = w / 2;
      const cy = h / 2;
      const halfR = Math.min(cx, cy) * (variant === "preview" ? 0.92 : 1);

      // Background: deep space radial gradient
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, halfR);
      bg.addColorStop(0, "#1c2040");
      bg.addColorStop(0.55, "#0e1328");
      bg.addColorStop(1, "#080b18");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);

      // Faint orbit ring guides
      ctx.save();
      ctx.strokeStyle = "rgba(130, 170, 230, 0.09)";
      ctx.lineWidth = 0.5;
      for (const ring of RING_CONFIGS) {
        ctx.beginPath();
        ctx.arc(cx, cy, ring.rf * halfR, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      // Central star glow
      const coreR = halfR * 0.13;
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
      core.addColorStop(0, "rgba(215, 228, 255, 0.95)");
      core.addColorStop(0.45, "rgba(160, 190, 255, 0.45)");
      core.addColorStop(1, "rgba(100, 140, 220, 0)");
      ctx.fillStyle = core;
      ctx.beginPath();
      ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
      ctx.fill();

      // Orbiting stars
      t += 1;
      for (const star of stars) {
        star.angle += star.speed;

        const alpha = Math.max(0, Math.min(1,
          star.twinkleBase + Math.sin(t * star.twinkleSpeed + star.twinklePhase) * star.twinkleAmp
        ));

        const px = cx + Math.cos(star.angle) * star.rf * halfR;
        const py = cy + Math.sin(star.angle) * star.rf * halfR;
        const { r: cr, g: cg, b: cb } = star.color;

        // Soft glow halo
        const glowR = star.size * 2.8;
        const glow = ctx.createRadialGradient(px, py, 0, px, py, glowR);
        glow.addColorStop(0, `rgba(${cr},${cg},${cb},${(alpha * 0.55).toFixed(2)})`);
        glow.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(px, py, glowR, 0, Math.PI * 2);
        ctx.fill();

        // Star core dot
        ctx.fillStyle = `rgba(${cr},${cg},${cb},${alpha.toFixed(2)})`;
        ctx.beginPath();
        ctx.arc(px, py, star.size * 0.65, 0, Math.PI * 2);
        ctx.fill();
      }

      frameId = requestAnimationFrame(draw);
    };

    resize();
    draw();

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    return () => {
      cancelAnimationFrame(frameId);
      ro.disconnect();
    };
  }, [variant]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
