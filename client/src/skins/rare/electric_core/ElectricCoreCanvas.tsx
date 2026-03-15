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
  extended: boolean;
  tipBoost: number;
};

const ELECTRIC_CORE_SPEED = 0.6;
const ELECTRIC_CORE_EXTENDED_CHANCE = 0;
const ELECTRIC_CORE_EXTENDED_LENGTH_MIN = 1;
const ELECTRIC_CORE_EXTENDED_LENGTH_MAX = 3;
const ELECTRIC_CORE_EXTENDED_INTENSITY = 1;
const ELECTRIC_CORE_EXTENDED_GLOW_MULTIPLIER = 3;
const ELECTRIC_CORE_CANVAS_SCALE = 1;
const ELECTRIC_CORE_ART_SCALE = 1.1 / 2.12;

function randFrom(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function makeBolt(angle: number): BoltState {
  const extended = Math.random() < ELECTRIC_CORE_EXTENDED_CHANCE;
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
    extended,
    tipBoost: extended
      ? randFrom(
          ELECTRIC_CORE_EXTENDED_LENGTH_MIN,
          ELECTRIC_CORE_EXTENDED_LENGTH_MAX,
        )
      : 0,
  };
}

interface Props {
  className: string;
  speedMultiplier?: number;
}

export function ElectricCoreCanvas({ className, speedMultiplier = 1 }: Props) {
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
    const speed = ELECTRIC_CORE_SPEED * speedMultiplier;
    const bolts = Array.from({ length: 5 }, (_, index) => {
      const bolt = makeBolt((index / 5) * Math.PI * 2);
      bolt.fadeRate = randFrom(0.045, 0.09) * speed;
      bolt.drift = randFrom(-0.01, 0.01) * speed;
      bolt.timerRate = randFrom(0.015, 0.05) * speed;
      bolt.angVel = randFrom(0.03, 0.07) * speed;
      return bolt;
    });

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.max(1, window.devicePixelRatio || 1);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const artSize =
        (Math.min(width, height) / ELECTRIC_CORE_CANVAS_SCALE) *
        (ELECTRIC_CORE_CANVAS_SCALE * ELECTRIC_CORE_ART_SCALE);
      coreRadius = artSize * 0.13;
      wallRadius = artSize * 0.46;
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
      const clipRadius = Math.max(wallRadius - 12, wallRadius * 0.62);

      for (const bolt of bolts) {
        bolt.angle += bolt.drift;
        bolt.width -= bolt.fadeRate;
        bolt.timer -= bolt.timerRate;

        if (bolt.width <= 0) {
          const extended = Math.random() < ELECTRIC_CORE_EXTENDED_CHANCE;
          bolt.angle = randFrom(0, Math.PI * 2);
          bolt.width = randFrom(1.8, 2.8);
          bolt.fadeRate = randFrom(0.045, 0.09) * speed;
          bolt.drift = randFrom(-0.01, 0.01) * speed;
          bolt.timerRate = randFrom(0.015, 0.05) * speed;
          bolt.phaseDiff = randFrom(1.4, 1.9);
          bolt.extended = extended;
          bolt.tipBoost = extended
            ? randFrom(
                ELECTRIC_CORE_EXTENDED_LENGTH_MIN,
                ELECTRIC_CORE_EXTENDED_LENGTH_MAX,
              )
            : 0;
        }

        if (bolt.timer <= 0) {
          bolt.phase = randFrom(0, Math.PI * 2);
          bolt.amp = randFrom(6, 12);
          bolt.angVel = randFrom(0.03, 0.07) * speed;
          bolt.timer = 1;
        }

        const points = Array.from({ length: numPoints }, (_, index) => {
          bolt.phase -= bolt.angVel;
          const progress = index / (numPoints - 1);
          const extraReach =
            bolt.extended && index >= numPoints - 2
              ? bolt.tipBoost * (index === numPoints - 1 ? 1 : 0.45)
              : 0;
          const x =
            coreRadius + progress * (wallRadius - coreRadius - 6) + extraReach;
          const y =
            bolt.amp *
            Math.max(0.15, progress) *
            (1 - progress * 0.22) *
            (bolt.extended && index >= numPoints - 2
              ? ELECTRIC_CORE_EXTENDED_INTENSITY
              : 1) *
            Math.sin(bolt.phase + index * bolt.phaseDiff);
          return { x, y };
        });

        const drawBolt = (startIndex: number, glowMultiplier = 1) => {
          ctx.beginPath();
          ctx.moveTo(points[startIndex].x, points[startIndex].y);
          for (let i = startIndex + 1; i < points.length; i += 1) {
            ctx.lineTo(points[i].x, points[i].y);
          }
          ctx.strokeStyle = "#ff00cc";
          ctx.lineWidth = bolt.width + 4;
          ctx.globalAlpha = 0.24;
          ctx.shadowBlur =
            (bolt.extended ? 10 * ELECTRIC_CORE_EXTENDED_GLOW_MULTIPLIER : 10) *
            glowMultiplier;
          ctx.shadowColor = "#ff00cc";
          ctx.stroke();

          ctx.beginPath();
          ctx.moveTo(points[startIndex].x, points[startIndex].y);
          for (let i = startIndex + 1; i < points.length; i += 1) {
            ctx.lineTo(points[i].x, points[i].y);
          }
          ctx.strokeStyle = "#ff00cc";
          ctx.lineWidth = bolt.width;
          ctx.globalAlpha = 1;
          ctx.shadowBlur =
            (bolt.extended ? 4 * ELECTRIC_CORE_EXTENDED_GLOW_MULTIPLIER : 4) *
            glowMultiplier;
          ctx.stroke();
        };

        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, clipRadius, 0, Math.PI * 2);
        ctx.clip();
        ctx.translate(cx, cy);
        ctx.rotate(bolt.angle);
        drawBolt(0);
        ctx.restore();

        if (bolt.extended) {
          ctx.save();
          ctx.translate(cx, cy);
          ctx.rotate(bolt.angle);
          drawBolt(numPoints - 3, 1.15);
          ctx.restore();
        }

        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(bolt.angle);
        const tip = points[points.length - 1];
        ctx.beginPath();
        ctx.arc(tip.x, tip.y, bolt.width + 1.5, 0, Math.PI * 2);
        ctx.fillStyle = "#ff00cc";
        ctx.shadowBlur = bolt.extended
          ? 5 * ELECTRIC_CORE_EXTENDED_GLOW_MULTIPLIER
          : 5;
        ctx.shadowColor = "#ff00cc";
        ctx.fill();
        ctx.restore();
      }

      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius * 1.0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(55, 55, 58, 0.98)";
      ctx.fill();
      ctx.lineWidth = Math.max(2, coreRadius * 0.18);
      ctx.strokeStyle = "#ff00cc";
      ctx.shadowBlur = 8;
      ctx.shadowColor = "#ff00cc";
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx, cy, coreRadius * 0.32, 0, Math.PI * 2);
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
  }, [speedMultiplier]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
