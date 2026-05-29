// src/features/coming-soon/ParticleNetwork.tsx
import { useEffect, useRef, type RefObject } from "react";
import type { Rgb } from "./useBrandCycle";

interface IParticleNetworkProps {
  /** RGB atual do accent (vem de useBrandCycle). */
  rgbRef: RefObject<Rgb>;
}

interface INode {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

const LINK_DIST = 130;

/** Camada 3 — rede de partículas conectadas, com repulsão ao mouse. Decorativa. */
export function ParticleNetwork({ rgbRef }: IParticleNetworkProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;
    let nodes: INode[] = [];
    const mouse = { x: -9999, y: -9999 };

    const initNodes = () => {
      const count = width < 700 ? 38 : 80;
      nodes = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.5,
        vy: (Math.random() - 0.5) * 0.5,
      }));
    };

    const fit = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initNodes();
    };

    fit();

    let raf = 0;
    let running = true;

    const draw = () => {
      const [r, g, b] = rgbRef.current;
      ctx.clearRect(0, 0, width, height);

      for (const n of nodes) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < 0 || n.x > width) n.vx *= -1;
        if (n.y < 0 || n.y > height) n.vy *= -1;
        const dx = n.x - mouse.x;
        const dy = n.y - mouse.y;
        const d = Math.hypot(dx, dy);
        if (d < LINK_DIST && d > 0) {
          n.x += (dx / d) * 1.4;
          n.y += (dy / d) * 1.4;
        }
      }

      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        if (!a) continue;
        for (let j = i + 1; j < nodes.length; j++) {
          const bNode = nodes[j];
          if (!bNode) continue;
          const dx = a.x - bNode.x;
          const dy = a.y - bNode.y;
          const dist = Math.hypot(dx, dy);
          if (dist < LINK_DIST) {
            ctx.strokeStyle = `rgba(${r},${g},${b},${(1 - dist / LINK_DIST) * 0.35})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(bNode.x, bNode.y);
            ctx.stroke();
          }
        }
      }

      ctx.fillStyle = `rgba(${r},${g},${b},0.85)`;
      for (const n of nodes) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, 2, 0, Math.PI * 2);
        ctx.fill();
      }

      if (running) raf = requestAnimationFrame(draw);
    };
    draw();

    const onMove = (e: MouseEvent) => {
      mouse.x = e.clientX;
      mouse.y = e.clientY;
    };
    const onVisibility = () => {
      if (document.hidden) {
        running = false;
        cancelAnimationFrame(raf);
      } else if (!running) {
        running = true;
        draw();
      }
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("resize", fit);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("resize", fit);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [rgbRef]);

  return <canvas ref={canvasRef} className="cs-canvas cs-net" aria-hidden="true" />;
}
