import { useEffect, useRef } from "react";

type BoltState = {
  angle: number;
  width: number;
  fadeRate: number;
  drift: number;
  timer: number;
  timerRate: number;
  phase: number;
  phaseDiff: number;
  amp: number;
  angVel: number;
};

const ELECTRIC_CORE_SPEED = 0.2;

function randFrom(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function makeBolt(angle: number): BoltState {
  return {
    angle,
    width: randFrom(1.8, 2.8),
    fadeRate: randFrom(0.045, 0.09) * ELECTRIC_CORE_SPEED,
    drift: randFrom(-0.01, 0.01) * ELECTRIC_CORE_SPEED,
    timer: 1,
    timerRate: randFrom(0.015, 0.05) * ELECTRIC_CORE_SPEED,
    phase: randFrom(0, Math.PI * 2),
    phaseDiff: randFrom(1.4, 1.9),
    amp: randFrom(6, 12),
    angVel: randFrom(0.03, 0.07) * ELECTRIC_CORE_SPEED,
  };
}

interface Props {
  className: string;
}

export function ElectricCoreCanvas({ className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frameId = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let coreRadius = 0;
    let wallRadius = 0;
    const numPoints = 8;
    const bolts = Array.from({ length: 5 }, (_, index) =>
      makeBolt((index / 5) * Math.PI * 2),
    );

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      coreRadius = Math.min(width, height) * 0.13;
      wallRadius = Math.min(width, height) * 0.46;
    };

    resize();

    const observer =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    if (observer) observer.observe(canvas);
    window.addEventListener("resize", resize);

    const render = () => {
      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, wallRadius + 2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(36, 36, 38, 0.95)";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(cx, cy, wallRadius - 4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(62, 62, 64, 0.95)";
      ctx.fill();
      ctx.restore();

      for (const bolt of bolts) {
        bolt.angle += bolt.drift;
        bolt.width -= bolt.fadeRate;
        bolt.timer -= bolt.timerRate;

        if (bolt.width <= 0) {
          bolt.angle = randFrom(0, Math.PI * 2);
          bolt.width = randFrom(1.8, 2.8);
          bolt.fadeRate = randFrom(0.045, 0.09) * ELECTRIC_CORE_SPEED;
          bolt.timerRate = randFrom(0.015, 0.05) * ELECTRIC_CORE_SPEED;
          bolt.phaseDiff = randFrom(1.4, 1.9);
        }

        if (bolt.timer <= 0) {
          bolt.phase = randFrom(0, Math.PI * 2);
          bolt.amp = randFrom(6, 12);
          bolt.angVel = randFrom(0.03, 0.07) * ELECTRIC_CORE_SPEED;
          bolt.timer = 1;
        }

        const points = Array.from({ length: numPoints }, (_, index) => {
          bolt.phase -= bolt.angVel;
          const progress = index / (numPoints - 1);
          const x = coreRadius + progress * (wallRadius - coreRadius - 6);
          const y =
            bolt.amp *
            Math.max(0.15, progress) *
            (1 - progress * 0.22) *
            Math.sin(bolt.phase + index * bolt.phaseDiff);
          return { x, y };
        });

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(bolt.angle);

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i += 1) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.strokeStyle = "#ff00cc";
        ctx.lineWidth = bolt.width + 4;
        ctx.globalAlpha = 0.24;
        ctx.shadowBlur = 10;
        ctx.shadowColor = "#ff00cc";
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(points[0].x, points[0].y);
        for (let i = 1; i < points.length; i += 1) {
          ctx.lineTo(points[i].x, points[i].y);
        }
        ctx.strokeStyle = "#ff00cc";
        ctx.lineWidth = bolt.width;
        ctx.globalAlpha = 1;
        ctx.shadowBlur = 4;
        ctx.stroke();

        const tip = points[points.length - 1];
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, bolt.width + 1.5, 0, Math.PI * 2);
        ctx.fillStyle = "#ff00cc";
        ctx.fill();
        ctx.restore();
      }

      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius * 1.22, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(55, 55, 58, 0.98)";
      ctx.fill();
      ctx.lineWidth = Math.max(2, coreRadius * 0.18);
      ctx.strokeStyle = "#ff00cc";
      ctx.shadowBlur = 8;
      ctx.shadowColor = "#ff00cc";
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius * 0.45, 0, Math.PI * 2);
      ctx.fillStyle = "#ff00cc";
      ctx.fill();

      frameId = window.requestAnimationFrame(render);
    };

    frameId = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(frameId);
      observer?.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
