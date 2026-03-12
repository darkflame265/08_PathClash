import { useEffect, useRef } from "react";

interface Props {
  className?: string;
  density?: number;
}

const COLORS = ["#000030", "#4d4398", "#4784bf", "#000030", "#4d4398", "#ffffff"];

export function StarrySkySkin({ className, density = 0.24 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let frameId = 0;
    let particles: Array<{
      x: number;
      y: number;
      radius: number;
      color: string;
      radians: number;
      velocity: number;
      distanceFromCenter: number;
    }> = [];

    const randomIntFromRange = (min: number, max: number) =>
      Math.floor(Math.random() * (max - min + 1) + min);

    const randomColor = () => COLORS[Math.floor(Math.random() * COLORS.length)];

    const fitCanvasSize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(rect.width * dpr));
      canvas.height = Math.max(1, Math.floor(rect.height * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const width = rect.width;
      const height = rect.height;
      const count = Math.max(140, Math.round(width * height * density));
      const maxDistance = Math.max(width, height) / 2 + Math.min(width, height) * 0.25;

      particles = Array.from({ length: count }, () => ({
        x: width / 2,
        y: height / 2,
        radius: Math.random() + 0.5,
        color: randomColor(),
        radians: Math.random() * Math.PI * 2,
        velocity: 0.001,
        distanceFromCenter: randomIntFromRange(10, Math.max(12, Math.floor(maxDistance))),
      }));
    };

    const animate = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      const g = ctx.createLinearGradient(0, 0, width, height);
      g.addColorStop(0, "rgba(19,27,35,.05)");
      g.addColorStop(1, "rgba(10,20,67,.05)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, width, height);

      for (const particle of particles) {
        particle.radians += particle.velocity;
        particle.x = Math.cos(particle.radians) * particle.distanceFromCenter + width / 2;
        particle.y = Math.sin(particle.radians) * particle.distanceFromCenter + height / 2;

        ctx.beginPath();
        ctx.fillStyle = particle.color;
        ctx.globalAlpha = 0.8;
        ctx.arc(particle.x, particle.y, particle.radius, 0, Math.PI * 2, false);
        ctx.fill();
      }

      frameId = window.requestAnimationFrame(animate);
    };

    fitCanvasSize();
    animate();

    window.addEventListener("resize", fitCanvasSize);

    return () => {
      window.removeEventListener("resize", fitCanvasSize);
      window.cancelAnimationFrame(frameId);
    };
  }, [density]);

  return <canvas ref={canvasRef} className={className} aria-hidden="true" />;
}
