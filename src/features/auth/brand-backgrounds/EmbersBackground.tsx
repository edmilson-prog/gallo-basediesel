import { useEffect, useRef } from "react";

const GOLD = "230,180,90";

/** Variant A: gold embers rising over a faint technical grid. Canvas, no deps. */
export function EmbersBackground() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let raf = 0;
    let width = 0;
    let height = 0;
    type P = { x: number; y: number; v: number; o: number; r: number; dx: number };
    let ps: P[] = [];
    const mk = (): P => ({
      x: Math.random() * width,
      y: Math.random() * height,
      v: Math.random() * 0.4 + 0.12,
      o: Math.random() * 0.5 + 0.2,
      r: Math.random() * 1.4 + 0.4,
      dx: (Math.random() - 0.5) * 0.15,
    });
    const init = () => {
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      canvas.width = width;
      canvas.height = height;
      ps = [];
      const n = Math.floor((width * height) / 2600);
      for (let i = 0; i < n; i++) ps.push(mk());
    };
    const grid = () => {
      ctx.strokeStyle = "rgba(201,162,74,0.06)";
      ctx.lineWidth = 1;
      for (const f of [0.3, 0.6, 0.85]) {
        ctx.beginPath();
        ctx.moveTo(0, height * f);
        ctx.lineTo(width, height * f);
        ctx.stroke();
      }
    };
    const paint = (p: P) => {
      ctx.fillStyle = `rgba(${GOLD},${p.o})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    };
    const draw = () => {
      ctx.clearRect(0, 0, width, height);
      grid();
      for (const p of ps) {
        p.y -= p.v;
        p.x += p.dx;
        if (p.y < -4) {
          p.x = Math.random() * width;
          p.y = height + 4;
        }
        paint(p);
      }
      raf = requestAnimationFrame(draw);
    };
    init();
    if (reduce) {
      grid();
      for (const p of ps) paint(p);
    } else {
      raf = requestAnimationFrame(draw);
    }
    const ro = new ResizeObserver(() => init());
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);
  return <canvas ref={ref} className="absolute inset-0 h-full w-full" aria-hidden="true" />;
}
