import { useEffect, useRef } from "react";

export type ParticleMode = "oil" | "mesh" | "flow" | "off";

interface IOilParticle {
  x: number;
  y: number;
  r: number;
  vy: number;
  sway: number;
  ph: number;
  a: number;
}

interface IFlowParticle {
  x: number;
  y: number;
  px: number;
  py: number;
  a: number;
  sp: number;
}

const GOLD = "224,187,78"; // rgb for --gallo-diesel-light, matches the brand's oil-gold accent

/**
 * Canvas particle field for the login poster panel — three ambient treatments
 * (oil droplets drifting up, a technical mesh pulse, flowing streaklines) plus
 * "off". Ported from the GALLO Design System's login-editorial particles.js.
 */
export function ParticleField({ mode, className }: { mode: ParticleMode; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const restartRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current;
    const parent = canvas?.parentElement;
    if (!canvas || !parent) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let t = 0;
    let raf = 0;
    let oil: IOilParticle[] = [];
    let flow: IFlowParticle[] = [];

    const seed = () => {
      oil = Array.from({ length: 150 }, () => {
        const big = Math.random() < 0.08;
        return {
          x: Math.random() * width,
          y: Math.random() * height,
          r: big ? 1.6 + Math.random() * 1.5 : 0.4 + Math.random() * 0.9,
          vy: (big ? 0.09 : 0.16) + Math.random() * 0.2,
          sway: 6 + Math.random() * 18,
          ph: Math.random() * Math.PI * 2,
          a: (big ? 0.1 : 0.16) + Math.random() * 0.26,
        };
      });
      flow = Array.from({ length: 130 }, () => {
        const p = { x: Math.random() * width, y: Math.random() * height, px: 0, py: 0 };
        return {
          ...p,
          px: p.x,
          py: p.y,
          a: 0.05 + Math.random() * 0.14,
          sp: 0.35 + Math.random() * 0.75,
        };
      });
    };

    const resize = () => {
      const rect = parent.getBoundingClientRect();
      if (!rect.width || !rect.height) return false;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed();
      return true;
    };

    const angleAt = (x: number, y: number) =>
      Math.sin(x * 0.0042) * 1.5 + Math.cos(y * 0.0055) * 1.5 - 1.35;

    const drawOil = () => {
      ctx.clearRect(0, 0, width, height);
      for (const p of oil) {
        p.y -= p.vy;
        p.ph += 0.006;
        if (p.y < -6) {
          p.y = height + 6;
          p.x = Math.random() * width;
        }
        const x = p.x + Math.sin(p.ph) * p.sway;
        ctx.beginPath();
        ctx.arc(x, p.y, p.r, 0, 6.2832);
        ctx.fillStyle = `rgba(${GOLD},${p.a})`;
        ctx.fill();
        if (p.r > 1.5) {
          ctx.beginPath();
          ctx.arc(x, p.y, p.r * 3.4, 0, 6.2832);
          ctx.fillStyle = `rgba(${GOLD},${p.a * 0.13})`;
          ctx.fill();
        }
      }
    };

    const drawMesh = () => {
      ctx.clearRect(0, 0, width, height);
      const step = 36;
      const wave = (x: number, y: number) => {
        const v = Math.sin(x * 0.011 + y * 0.017 - t * 0.85);
        return Math.max(0, (v - 0.35) / 0.65);
      };
      for (let y = step / 2; y < height; y += step) {
        for (let x = step / 2; x < width; x += step) {
          const b = wave(x, y);
          ctx.beginPath();
          ctx.arc(x, y, 0.8 + b * 1.5, 0, 6.2832);
          ctx.fillStyle = `rgba(${GOLD},${0.05 + b * 0.42})`;
          ctx.fill();
          if (b > 0.6) {
            const nb = wave(x + step, y);
            if (nb > 0.6) {
              ctx.beginPath();
              ctx.moveTo(x, y);
              ctx.lineTo(x + step, y);
              ctx.strokeStyle = `rgba(${GOLD},${(Math.min(b, nb) - 0.6) * 0.5})`;
              ctx.lineWidth = 1;
              ctx.stroke();
            }
          }
        }
      }
    };

    const drawFlow = () => {
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,0.055)";
      ctx.fillRect(0, 0, width, height);
      ctx.globalCompositeOperation = "source-over";
      ctx.lineCap = "round";
      for (const p of flow) {
        p.px = p.x;
        p.py = p.y;
        const a = angleAt(p.x, p.y) + t * 0.06;
        p.x += Math.cos(a) * p.sp;
        p.y += Math.sin(a) * p.sp - 0.12;
        if (p.x < -20 || p.x > width + 20 || p.y < -20 || p.y > height + 20) {
          p.x = Math.random() * width;
          p.y = height + 10;
          p.px = p.x;
          p.py = p.y;
        }
        ctx.beginPath();
        ctx.moveTo(p.px, p.py);
        ctx.lineTo(p.x, p.y);
        ctx.strokeStyle = `rgba(${GOLD},${p.a})`;
        ctx.lineWidth = 1.1;
        ctx.stroke();
      }
    };

    const drawFrame = (currentMode: ParticleMode) => {
      if (currentMode === "mesh") drawMesh();
      else if (currentMode === "flow") drawFlow();
      else drawOil();
    };

    const frame = () => {
      t += 0.016;
      const currentMode = modeRef.current;
      if (currentMode !== "off") drawFrame(currentMode);
      raf = requestAnimationFrame(frame);
    };

    const start = () => {
      cancelAnimationFrame(raf);
      const currentMode = modeRef.current;
      if (currentMode === "off") {
        ctx.clearRect(0, 0, width, height);
        return;
      }
      if (reduce) {
        t = 1.6;
        ctx.clearRect(0, 0, width, height);
        drawFrame(currentMode);
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    const onResize = () => {
      if (resize()) start();
    };

    restartRef.current = start;
    if (resize()) start();
    window.addEventListener("resize", onResize);
    const observer = new ResizeObserver(onResize);
    observer.observe(parent);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
      observer.disconnect();
    };
    // `mode` changes are handled by the effect below — the canvas/particle
    // setup itself only needs to run once per mount.
  }, []);

  // A plain mode switch (e.g. "off" -> "oil") needs to kick the rAF loop
  // back on explicitly — modeRef alone only affects an already-running loop.
  useEffect(() => {
    restartRef.current();
  }, [mode]);

  return <canvas ref={canvasRef} aria-hidden="true" className={className} />;
}
