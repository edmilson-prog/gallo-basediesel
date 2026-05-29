// src/features/coming-soon/EmberField.tsx
import { useEffect, useRef, type RefObject } from "react";
import type { Rgb } from "./useBrandCycle";

interface IEmberFieldProps {
  rgbRef: RefObject<Rgb>;
}

interface IEmber {
  x: number;
  y: number;
  r: number;
  vy: number;
  drift: number;
  life: number;
  max: number;
}

/** Camada 4 — brasas subindo com glow. Desativada em mobile e reduced-motion. Decorativa. */
export function EmberField({ rgbRef }: IEmberFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.innerWidth < 700) return; // mobile: sem brasas

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let embers: IEmber[] = [];

    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();

    const spawn = (): IEmber => ({
      x: Math.random() * width,
      y: height + 10,
      r: Math.random() * 2.2 + 0.6,
      vy: -(Math.random() * 0.9 + 0.4),
      drift: (Math.random() - 0.5) * 0.4,
      life: 0,
      max: Math.random() * 220 + 120,
    });

    let raf = 0;
    let running = true;

    const draw = () => {
      const [r, g, b] = rgbRef.current;
      ctx.clearRect(0, 0, width, height);

      if (embers.length < 90 && Math.random() < 0.6) embers.push(spawn());
      embers = embers.filter((e) => e.life < e.max && e.y > -20);

      for (const e of embers) {
        e.life++;
        e.y += e.vy;
        e.x += e.drift + Math.sin(e.life / 20) * 0.3;
        const a = (1 - e.life / e.max) * 0.9;
        ctx.fillStyle = `rgba(${r},${g},${b},${a})`;
        ctx.shadowBlur = 8;
        ctx.shadowColor = `rgba(${r},${g},${b},${a})`;
        ctx.beginPath();
        ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.shadowBlur = 0;

      if (running) raf = requestAnimationFrame(draw);
    };
    draw();

    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        draw();
      }
    };
    window.addEventListener("resize", fit);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", fit);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [rgbRef]);

  return <canvas ref={canvasRef} className="cs-canvas cs-embers" aria-hidden="true" />;
}
