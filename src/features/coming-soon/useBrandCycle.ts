// src/features/coming-soon/useBrandCycle.ts
import { useEffect, useRef, type RefObject } from "react";

export type Rgb = [number, number, number];

export interface IBrand {
  name: string;
  rgb: Rgb;
}

/** Submarcas GALLO (Parts verde, Service vermelho, Industrial amarelo). */
export const BRANDS: IBrand[] = [
  { name: "Parts", rgb: [30, 122, 60] },
  { name: "Service", rgb: [200, 38, 44] },
  { name: "Industrial", rgb: [199, 156, 44] },
];

const CYCLE_MS = 6000;
const LERP = 0.04;

/**
 * Anima o accent multimarca. Escreve `--coming-accent` (triplo "r, g, b") no
 * elemento alvo e devolve um ref com o RGB atual (lido pelos canvases por frame).
 * Respeita prefers-reduced-motion: aplica a 1ª marca fixa, sem ciclo nem rAF.
 */
export function useBrandCycle(targetRef: RefObject<HTMLElement | null>): RefObject<Rgb> {
  const rgbRef = useRef<Rgb>([...BRANDS[0].rgb]);

  useEffect(() => {
    const el = targetRef.current;
    if (!el) return;

    const apply = (rgb: Rgb) => {
      const r = Math.round(rgb[0]);
      const g = Math.round(rgb[1]);
      const b = Math.round(rgb[2]);
      el.style.setProperty("--coming-accent", `${r}, ${g}, ${b}`);
      rgbRef.current = [r, g, b];
    };

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      apply([...BRANDS[0].rgb]);
      return;
    }

    let idx = 0;
    const cur: Rgb = [...BRANDS[0].rgb];
    let target: Rgb = [...BRANDS[0].rgb];
    let raf = 0;

    const interval = window.setInterval(() => {
      idx = (idx + 1) % BRANDS.length;
      target = [...BRANDS[idx].rgb];
    }, CYCLE_MS);

    const frame = () => {
      cur[0] += (target[0] - cur[0]) * LERP;
      cur[1] += (target[1] - cur[1]) * LERP;
      cur[2] += (target[2] - cur[2]) * LERP;
      apply(cur);
      raf = requestAnimationFrame(frame);
    };
    frame();

    return () => {
      cancelAnimationFrame(raf);
      window.clearInterval(interval);
    };
  }, [targetRef]);

  return rgbRef;
}
