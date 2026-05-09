import { useEffect, useRef } from "react";

interface Props {
  className?: string;
  radiusFraction?: number;
}

const PRISM_ANGLES = [0, 72, 144, 216, 288];
const CRYSTAL_ANGLES = [0, 120, 240];

interface Particle {
  ang: number;
  r1: number;
  r2: number;
  spd: number;
  dly: number;
  size: number;
}

const PARTICLES: Particle[] = [
  { ang: 0,   r1: 0.74, r2: 0.07, spd: 240, dly: 0,    size: 3 },
  { ang: 72,  r1: 0.69, r2: 0.06, spd: 270, dly: 90,   size: 2 },
  { ang: 144, r1: 0.79, r2: 0.09, spd: 228, dly: 180,  size: 3 },
  { ang: 216, r1: 0.71, r2: 0.06, spd: 312, dly: 48,   size: 2 },
  { ang: 288, r1: 0.66, r2: 0.07, spd: 252, dly: 126,  size: 2.5 },
  { ang: 36,  r1: 0.83, r2: 0.04, spd: 210, dly: 60,   size: 2 },
  { ang: 108, r1: 0.60, r2: 0.09, spd: 300, dly: 210,  size: 3 },
  { ang: 180, r1: 0.86, r2: 0.06, spd: 288, dly: 144,  size: 2 },
];

export function FrostHeartCanvas({ className, radiusFraction = 1.0 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

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
      r = Math.min(cx, cy) * radiusFraction - 1;
    };

    const drawBackground = (w: number, h: number) => {
      const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
      bg.addColorStop(0,    "#0c2d48");
      bg.addColorStop(0.45, "#062136");
      bg.addColorStop(0.80, "#020f1e");
      bg.addColorStop(1,    "#000a14");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
    };

    const drawAuroraRing = (
      ringR: number,
      width: number,
      rotation: number,
      arcs: Array<{ start: number; end: number; alpha: number; color: string }>,
    ) => {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rotation);
      for (const arc of arcs) {
        ctx.beginPath();
        ctx.arc(0, 0, ringR, arc.start, arc.end);
        ctx.strokeStyle = arc.color.replace("$a", String(arc.alpha));
        ctx.lineWidth = width;
        ctx.shadowBlur = r * 0.18;
        ctx.shadowColor = "rgba(34,211,238,0.5)";
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      ctx.restore();
    };

    const drawAuroraRings = (pulse: number) => {
      const deg = Math.PI / 180;
      const rot1 = t * 0.006;
      const rot2 = -t * 0.0027;
      const r1 = r * 1.12;
      const r2 = r * 1.38;

      drawAuroraRing(r1, r * 0.055, rot1, [
        { start: 0, end: 30 * deg,   alpha: 0.38 + pulse * 0.1, color: "rgba(103,232,249,$a)" },
        { start: 60 * deg, end: 90 * deg, alpha: 0.15, color: "rgba(165,243,252,$a)" },
        { start: 180 * deg, end: 210 * deg, alpha: 0.30 + pulse * 0.08, color: "rgba(34,211,238,$a)" },
        { start: 300 * deg, end: 330 * deg, alpha: 0.24, color: "rgba(165,243,252,$a)" },
      ]);
      drawAuroraRing(r2, r * 0.055, rot2, [
        { start: 45 * deg,  end: 90 * deg,  alpha: 0.22, color: "rgba(34,211,238,$a)" },
        { start: 150 * deg, end: 195 * deg, alpha: 0.20, color: "rgba(165,243,252,$a)" },
        { start: 270 * deg, end: 315 * deg, alpha: 0.17, color: "rgba(34,211,238,$a)" },
      ]);
    };

    const drawSnowflakeArm = (scale: number) => {
      const s = scale;
      const stemLen   = 52 * s;
      const br1y      = -26 * s, br1tipX = 13.9 * s, br1tipY = -34 * s;
      const br2y      = -34 * s, br2tipX = 11.7 * s, br2tipY = -40.75 * s;
      const br3y      = -42 * s, br3tipX = 9.5 * s,  br3tipY = -47.5 * s;
      const tipOutY   = -59 * s, tipMidY = -52 * s,  tipW = 5 * s, tipInY = -45 * s;
      const tipInOutY = -57 * s, tipInW = 3 * s, tipInInY = -47 * s;

      ctx.lineCap = "round";

      ctx.strokeStyle = "#f0f9ff";
      ctx.lineWidth = Math.max(0.8, 2.5 * s);
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -stemLen); ctx.stroke();

      ctx.strokeStyle = "#bae6fd";
      ctx.lineWidth = Math.max(0.6, 2 * s);
      ctx.beginPath(); ctx.moveTo(0, br1y); ctx.lineTo(br1tipX, br1tipY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, br1y); ctx.lineTo(-br1tipX, br1tipY); ctx.stroke();

      ctx.strokeStyle = "#d9f3ff";
      ctx.lineWidth = Math.max(0.5, 1.75 * s);
      ctx.beginPath(); ctx.moveTo(0, br2y); ctx.lineTo(br2tipX, br2tipY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, br2y); ctx.lineTo(-br2tipX, br2tipY); ctx.stroke();

      ctx.strokeStyle = "#e0f2fe";
      ctx.lineWidth = Math.max(0.5, 1.5 * s);
      ctx.beginPath(); ctx.moveTo(0, br3y); ctx.lineTo(br3tipX, br3tipY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, br3y); ctx.lineTo(-br3tipX, br3tipY); ctx.stroke();

      ctx.fillStyle = "#e0f9ff";
      ctx.beginPath();
      ctx.moveTo(0, tipOutY);
      ctx.lineTo(tipW, tipMidY);
      ctx.lineTo(0, tipInY);
      ctx.lineTo(-tipW, tipMidY);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = "rgba(255,255,255,0.92)";
      ctx.beginPath();
      ctx.moveTo(0, tipInOutY);
      ctx.lineTo(tipInW, tipMidY);
      ctx.lineTo(0, tipInInY);
      ctx.lineTo(-tipInW, tipMidY);
      ctx.closePath();
      ctx.fill();
    };

    const drawSnowflake = (pulse: number) => {
      const scale = r / 70;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.globalAlpha = 0.9 + pulse * 0.1;
      ctx.shadowBlur = r * 0.22;
      ctx.shadowColor = "rgba(103,232,249,0.85)";
      for (let i = 0; i < 6; i++) {
        ctx.save();
        ctx.rotate((i * 60 * Math.PI) / 180);
        drawSnowflakeArm(scale);
        ctx.restore();
      }
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
      ctx.restore();
    };

    const drawVortexParticles = () => {
      for (const p of PARTICLES) {
        const elapsed = (t + p.dly) % p.spd;
        const progress = elapsed / p.spd;
        const curR = (p.r1 + (p.r2 - p.r1) * progress) * r;
        const ang = (p.ang * Math.PI) / 180 + progress * Math.PI * 2;
        const px = cx + Math.cos(ang) * curR;
        const py = cy + Math.sin(ang) * curR;
        const alpha = progress < 0.8 ? 0.9 : 0.9 * (1 - (progress - 0.8) / 0.2);
        const sz = p.size * (r / 100) * (1 - progress * 0.6);

        ctx.beginPath();
        ctx.arc(px, py, Math.max(0.4, sz), 0, Math.PI * 2);
        ctx.fillStyle = `rgba(165,243,252,${alpha})`;
        ctx.shadowBlur = r * 0.05;
        ctx.shadowColor = "rgba(103,232,249,0.9)";
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    };

    const drawPentagonShape = (cx2: number, cy2: number, size: number) => {
      ctx.save();
      ctx.translate(cx2, cy2);
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = ((i * 72 - 90) * Math.PI) / 180;
        const x = Math.cos(a) * size;
        const y = Math.sin(a) * size;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.closePath();
      ctx.fillStyle = "rgba(103,232,249,0)";
      ctx.fill();
      ctx.restore();
    };

    const drawDiamond = (cx2: number, cy2: number, size: number) => {
      ctx.save();
      ctx.translate(cx2, cy2);
      ctx.beginPath();
      ctx.moveTo(0, -size);
      ctx.lineTo(size, 0);
      ctx.lineTo(0, size);
      ctx.lineTo(-size, 0);
      ctx.closePath();
      ctx.fillStyle = "rgba(165,243,252,0)";
      ctx.fill();
      ctx.restore();
    };

    const drawCrystalOrbits = () => {
      const prismR = r * 1.14;
      const crystalR = r * 0.78;
      const prismSize = Math.max(2, r * 0.085);
      const crystalSize = Math.max(2, r * 0.12);
      const prismSpeed = 1 / (22 * 60);
      const crystalSpeed = 1 / (14 * 60);

      for (let i = 0; i < 5; i++) {
        const baseAng = (PRISM_ANGLES[i] * Math.PI) / 180;
        const ang = baseAng + t * prismSpeed * Math.PI * 2;
        const px = cx + Math.cos(ang) * prismR;
        const py = cy + Math.sin(ang) * prismR;

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(ang + t * prismSpeed * Math.PI * 2);
        ctx.beginPath();
        for (let j = 0; j < 5; j++) {
          const a = ((j * 72 - 90) * Math.PI) / 180;
          const vx = Math.cos(a) * prismSize;
          const vy = Math.sin(a) * prismSize;
          j === 0 ? ctx.moveTo(vx, vy) : ctx.lineTo(vx, vy);
        }
        ctx.closePath();
        const grad = ctx.createLinearGradient(-prismSize, -prismSize, prismSize, prismSize);
        grad.addColorStop(0, "#e0f9ff");
        grad.addColorStop(0.5, "#67e8f9");
        grad.addColorStop(1, "#0891b2");
        ctx.fillStyle = grad;
        ctx.shadowBlur = r * 0.12;
        ctx.shadowColor = "rgba(103,232,249,0.95)";
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      for (let i = 0; i < 3; i++) {
        const baseAng = (CRYSTAL_ANGLES[i] * Math.PI) / 180;
        const ang = baseAng - t * crystalSpeed * Math.PI * 2;
        const px = cx + Math.cos(ang) * crystalR;
        const py = cy + Math.sin(ang) * crystalR;

        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(-ang - t * crystalSpeed * Math.PI * 2);
        ctx.beginPath();
        ctx.moveTo(0, -crystalSize);
        ctx.lineTo(crystalSize, 0);
        ctx.lineTo(0, crystalSize);
        ctx.lineTo(-crystalSize, 0);
        ctx.closePath();
        const grad2 = ctx.createLinearGradient(-crystalSize, -crystalSize, crystalSize, crystalSize);
        grad2.addColorStop(0, "#f0fdff");
        grad2.addColorStop(0.45, "#a5f3fc");
        grad2.addColorStop(1, "#0891b2");
        ctx.fillStyle = grad2;
        ctx.shadowBlur = r * 0.14;
        ctx.shadowColor = "rgba(165,243,252,0.9)";
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.restore();
      }

      void drawPentagonShape;
      void drawDiamond;
    };

    const drawEye = (pulse: number) => {
      const eyeR = r * 0.28 * (1 + pulse * 0.05);
      const eye = ctx.createRadialGradient(
        cx - eyeR * 0.1, cy - eyeR * 0.15, 0,
        cx, cy, eyeR,
      );
      eye.addColorStop(0,    "#ffffff");
      eye.addColorStop(0.20, "#e0f9ff");
      eye.addColorStop(0.55, "#22d3ee");
      eye.addColorStop(0.85, "#0891b2");
      eye.addColorStop(1,    "#083344");
      ctx.beginPath();
      ctx.arc(cx, cy, eyeR, 0, Math.PI * 2);
      ctx.fillStyle = eye;
      ctx.shadowBlur = r * 0.22;
      ctx.shadowColor = `rgba(34,211,238,${0.8 + pulse * 0.2})`;
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.beginPath();
      ctx.arc(cx, cy, eyeR - r * 0.045, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(224,242,254,${0.5 + pulse * 0.15})`;
      ctx.lineWidth = Math.max(0.5, r * 0.015);
      ctx.stroke();
    };

    const drawBorderGlow = (pulse: number) => {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(165,243,252,${0.5 + pulse * 0.25})`;
      ctx.lineWidth = Math.max(1, r * 0.025);
      ctx.shadowBlur = r * 0.22;
      ctx.shadowColor = `rgba(103,232,249,${0.5 + pulse * 0.2})`;
      ctx.stroke();
      ctx.shadowBlur = 0;
    };

    const frame = () => {
      if (r === 0) { frameId = requestAnimationFrame(frame); return; }
      const w = cx * 2, h = cy * 2;
      const pulse = 0.5 + 0.5 * Math.sin(t * 0.026);

      ctx.clearRect(0, 0, w, h);

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();
      drawBackground(w, h);
      drawSnowflake(pulse);
      drawVortexParticles();
      drawEye(pulse);
      ctx.restore();

      drawAuroraRings(pulse);
      drawCrystalOrbits();
      drawBorderGlow(pulse);

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
