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
  { r: 220, g: 232, b: 248 }, // ice white
  { r: 190, g: 208, b: 230 }, // slate blue
  { r: 155, g: 182, b: 218 }, // steel blue
  { r: 108, g: 178, b: 252 }, // sky blue
  { r: 138, g: 160, b: 238 }, // violet-blue
  { r: 192, g: 148, b: 240 }, // soft violet
  { r: 222, g: 176, b: 255 }, // lavender
  { r: 245, g: 250, b: 255 }, // near-white
];

const RING_CONFIGS = [
  { count: 3, rf: 0.22, baseSpeed: 0.011 },
  { count: 5, rf: 0.41, baseSpeed: 0.0065 },
  { count: 7, rf: 0.63, baseSpeed: 0.0038 },
  { count: 9, rf: 0.85, baseSpeed: 0.0019 },
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
      bg.addColorStop(0, "#1a1d3e");
      bg.addColorStop(0.5, "#0c1124");
      bg.addColorStop(1, "#060914");
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
      const coreR = halfR * 0.14;
      const core = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
      core.addColorStop(0, "rgba(230, 240, 255, 0.98)");
      core.addColorStop(0.40, "rgba(170, 195, 255, 0.50)");
      core.addColorStop(1, "rgba(110, 148, 230, 0)");
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
