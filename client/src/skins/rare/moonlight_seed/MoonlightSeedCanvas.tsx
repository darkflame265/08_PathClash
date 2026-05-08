import { useEffect, useRef } from "react";

interface Props {
  className?: string;
}

const VINE_CONFIGS = [
  { a: -82, lf: 0.74, co: 0.15, speed: 0.007, phase: 0.0 },
  { a: -20, lf: 0.68, co: -0.16, speed: 0.006, phase: 1.1 },
  { a:  44, lf: 0.65, co:  0.18, speed: 0.008, phase: 2.2 },
  { a: 112, lf: 0.60, co: -0.15, speed: 0.007, phase: 3.3 },
  { a: 170, lf: 0.66, co:  0.16, speed: 0.006, phase: 0.8 },
  { a:-130, lf: 0.72, co: -0.17, speed: 0.007, phase: 1.9 },
] as const;

const ROOT_CONFIGS = [
  { a:  82, lf: 0.30, co:  0.05 },
  { a: 100, lf: 0.35, co: -0.04 },
  { a: 118, lf: 0.25, co:  0.07 },
] as const;

interface Firefly {
  bx: number; by: number;
  size: number;
  blinkPhase: number; blinkSpeed: number;
  risePhase: number; riseSpeed: number; riseAmt: number;
}

interface Dust {
  x: number; y: number;
  size: number;
  phase: number; speed: number;
  dx: number; dy: number;
}

export function MoonlightSeedCanvas({ className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let fireflies: Firefly[] = [];
    let dust: Dust[] = [];
    let cx = 0, cy = 0, r = 0;
    let frameId = 0;
    let t = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      cx = rect.width / 2;
      cy = rect.height / 2;
      r = Math.min(cx, cy) - 1;

      fireflies = Array.from({ length: 14 }, () => {
        const ang = Math.random() * Math.PI * 2;
        const pr = (0.16 + Math.random() * 0.62) * r;
        return {
          bx: cx + Math.cos(ang) * pr,
          by: cy + Math.sin(ang) * pr,
          size: 0.8 + Math.random() * 1.8,
          blinkPhase: Math.random() * Math.PI * 2,
          blinkSpeed: 0.025 + Math.random() * 0.035,
          risePhase: Math.random() * Math.PI * 2,
          riseSpeed: 0.008 + Math.random() * 0.012,
          riseAmt: (0.12 + Math.random() * 0.18) * r,
        };
      });

      dust = Array.from({ length: 30 }, () => {
        const ang = Math.random() * Math.PI * 2;
        const pr = Math.random() * 0.75 * r;
        return {
          x: cx + Math.cos(ang) * pr,
          y: cy + Math.sin(ang) * pr,
          size: 0.3 + Math.random() * 0.8,
          phase: Math.random() * Math.PI * 2,
          speed: 0.012 + Math.random() * 0.02,
          dx: (Math.random() - 0.5) * 0.25 * (r / 100),
          dy: (-0.08 - Math.random() * 0.14) * (r / 100),
        };
      });
    };

    const drawBg = (w: number, h: number) => {
      const bg = ctx.createRadialGradient(cx, cy - r * 0.1, 0, cx, cy, r);
      bg.addColorStop(0, "#071508");
      bg.addColorStop(0.55, "#040d05");
      bg.addColorStop(1, "#020704");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      const bw = r * 0.28;
      const beam = ctx.createLinearGradient(cx - bw, 0, cx + bw, 0);
      beam.addColorStop(0, "rgba(210,255,225,0)");
      beam.addColorStop(0.5, "rgba(210,255,225,0.032)");
      beam.addColorStop(1, "rgba(210,255,225,0)");
      ctx.fillStyle = beam;
      ctx.fillRect(cx - bw, 0, bw * 2, h);
    };

    const drawRoots = () => {
      for (const root of ROOT_CONFIGS) {
        const rad = (root.a * Math.PI) / 180;
        const len = root.lf * r;
        const ex = cx + Math.cos(rad) * len;
        const ey = cy + Math.sin(rad) * len;
        const perpRad = rad + Math.PI / 2;
        const cpx = cx + Math.cos(rad) * len * 0.5 + Math.cos(perpRad) * root.co * r;
        const cpy = cy + Math.sin(rad) * len * 0.5 + Math.sin(perpRad) * root.co * r;
        ctx.beginPath();
        ctx.moveTo(cx, cy + r * 0.09);
        ctx.quadraticCurveTo(cpx, cpy, ex, ey);
        ctx.strokeStyle = "rgba(18,65,28,0.6)";
        ctx.lineWidth = Math.max(0.5, r * 0.01);
        ctx.lineCap = "round";
        ctx.stroke();
      }
    };

    const drawVine = (vine: typeof VINE_CONFIGS[number]) => {
      const rad = (vine.a * Math.PI) / 180;
      const progress = 0.55 + 0.45 * Math.sin(t * vine.speed + vine.phase);
      const maxLen = vine.lf * r * progress;
      const ex = cx + Math.cos(rad) * maxLen;
      const ey = cy + Math.sin(rad) * maxLen;
      const perpRad = rad + Math.PI / 2;
      const coOff = vine.co * r * progress;
      const cpx = cx + Math.cos(rad) * maxLen * 0.52 + Math.cos(perpRad) * coOff;
      const cpy = cy + Math.sin(rad) * maxLen * 0.52 + Math.sin(perpRad) * coOff;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo(cpx, cpy, ex, ey);
      ctx.strokeStyle = `rgba(50,190,80,${0.13 * progress})`;
      ctx.lineWidth = Math.max(1, r * 0.06);
      ctx.lineCap = "round";
      ctx.shadowBlur = r * 0.1;
      ctx.shadowColor = "rgba(50,200,80,0.45)";
      ctx.stroke();
      ctx.shadowBlur = 0;

      const grad = ctx.createLinearGradient(cx, cy, ex, ey);
      grad.addColorStop(0, "rgba(14,72,28,0.75)");
      grad.addColorStop(0.55, `rgba(38,155,65,${0.9 * progress})`);
      grad.addColorStop(1, `rgba(95,250,130,${progress})`);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.quadraticCurveTo(cpx, cpy, ex, ey);
      ctx.strokeStyle = grad;
      ctx.lineWidth = Math.max(0.5, r * 0.016);
      ctx.lineCap = "round";
      ctx.stroke();

      const mx = cx + Math.cos(rad) * maxLen * 0.62 + Math.cos(perpRad) * coOff * 0.55;
      const my = cy + Math.sin(rad) * maxLen * 0.62 + Math.sin(perpRad) * coOff * 0.55;
      ctx.fillStyle = `rgba(60,200,80,${progress * 0.55})`;
      ctx.beginPath();
      ctx.arc(mx, my, Math.max(0.5, r * 0.015), 0, Math.PI * 2);
      ctx.fill();

      const budR = Math.max(1, (3 + progress * 2.2) * (r / 100));
      const budGlow = ctx.createRadialGradient(ex, ey, 0, ex, ey, budR * 2.8);
      budGlow.addColorStop(0, `rgba(180,255,200,${progress * 0.92})`);
      budGlow.addColorStop(0.45, `rgba(70,215,105,${progress * 0.45})`);
      budGlow.addColorStop(1, "rgba(35,155,65,0)");
      ctx.fillStyle = budGlow;
      ctx.beginPath();
      ctx.arc(ex, ey, budR * 2.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(215,255,225,${progress * 0.95})`;
      ctx.beginPath();
      ctx.arc(ex, ey, budR * 0.52, 0, Math.PI * 2);
      ctx.fill();
    };

    const drawFireflies = () => {
      for (const ff of fireflies) {
        const alpha = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * ff.blinkSpeed + ff.blinkPhase));
        const fy = ff.by + Math.sin(t * ff.riseSpeed + ff.risePhase) * ff.riseAmt;
        const dx = ff.bx - cx, dy = fy - cy;
        if (dx * dx + dy * dy > (r - 4) * (r - 4)) continue;
        const glowR = ff.size * (r / 100) * 4;
        const glow = ctx.createRadialGradient(ff.bx, fy, 0, ff.bx, fy, glowR);
        glow.addColorStop(0, `rgba(155,255,185,${alpha * 0.75})`);
        glow.addColorStop(1, "rgba(55,195,85,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(ff.bx, fy, glowR, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(228,255,235,${alpha})`;
        ctx.beginPath();
        ctx.arc(ff.bx, fy, ff.size * (r / 100) * 0.65, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawDust = () => {
      for (const d of dust) {
        const alpha = 0.18 + 0.28 * (0.5 + 0.5 * Math.sin(t * d.speed + d.phase));
        d.x += d.dx;
        d.y += d.dy;
        const dx = d.x - cx, dy = d.y - cy;
        if (dx * dx + dy * dy > (r * 0.76) * (r * 0.76)) {
          const ang = Math.random() * Math.PI * 2;
          const pr = (0.2 + Math.random() * 0.52) * r;
          d.x = cx + Math.cos(ang) * pr;
          d.y = cy + Math.sin(ang) * pr + r * 0.28;
        }
        ctx.fillStyle = `rgba(200,255,210,${alpha})`;
        ctx.beginPath();
        ctx.arc(d.x, d.y, d.size * (r / 100), 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawSeed = () => {
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.038);
      const auraR = r * 0.24;
      const aura = ctx.createRadialGradient(cx, cy, 0, cx, cy, auraR);
      aura.addColorStop(0, `rgba(95,255,125,${0.3 + pulse * 0.18})`);
      aura.addColorStop(0.5, `rgba(45,175,75,${0.2 + pulse * 0.12})`);
      aura.addColorStop(1, "rgba(28,115,52,0)");
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(cx, cy, auraR, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.17, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(60,200,85,${0.18 + pulse * 0.12})`;
      ctx.lineWidth = Math.max(0.5, r * 0.01);
      ctx.stroke();

      const sr = r * 0.115;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(-0.22);
      ctx.scale(1, 1.38);
      const seedGrad = ctx.createRadialGradient(-sr * 0.22, -sr * 0.39, 0, 0, 0, sr);
      seedGrad.addColorStop(0, "#ecfff2");
      seedGrad.addColorStop(0.28, "#80ffaa");
      seedGrad.addColorStop(0.65, "#2daa55");
      seedGrad.addColorStop(1, "#0d4a20");
      ctx.fillStyle = seedGrad;
      ctx.shadowBlur = sr * 0.7;
      ctx.shadowColor = "rgba(60,220,90,0.6)";
      ctx.beginPath();
      ctx.arc(0, 0, sr, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = "rgba(255,255,255,0.68)";
      ctx.beginPath();
      ctx.ellipse(-sr * 0.28, -sr * 0.39, sr * 0.33, sr * 0.19, -0.35, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const drawBorderGlow = () => {
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.038);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(45,195,80,${0.45 + pulse * 0.3})`;
      ctx.lineWidth = Math.max(1, r * 0.02);
      ctx.shadowBlur = r * 0.14;
      ctx.shadowColor = "rgba(45,195,80,0.65)";
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    const frame = () => {
      if (r === 0) { frameId = requestAnimationFrame(frame); return; }
      const w = cx * 2, h = cy * 2;
      ctx.clearRect(0, 0, w, h);
      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      drawBg(w, h);
      drawRoots();
      for (const vine of VINE_CONFIGS) drawVine(vine);
      drawDust();
      drawFireflies();
      drawSeed();
      ctx.restore();
      drawBorderGlow();
      t++;
      frameId = requestAnimationFrame(frame);
    };

    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();
    frameId = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(frameId);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
