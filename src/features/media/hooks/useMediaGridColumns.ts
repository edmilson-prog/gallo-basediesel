// src/features/media/hooks/useMediaGridColumns.ts
import { useEffect, useState } from "react";

/**
 * Returns a reactive column count for the customer-scope MediaGrid.
 *
 * Breakpoint map (matches Tailwind's default scale):
 *   < 640px  (mobile)   → 2 columns
 *   640–767px (sm)      → 3 columns
 *   768–1023px (md)     → 4 columns
 *   1024–1279px (lg)    → 5 columns
 *   ≥ 1280px (xl+)      → 6 columns
 *
 * Used by CustomerMediaGallery to pass a responsive `columns` prop to
 * MediaGallery instead of the previously hardcoded `columns={4}`.
 *
 * Initialises synchronously from `window.innerWidth` (no SSR here — SPA).
 */

const BREAKPOINTS = [
  { minWidth: 1280, columns: 6 },
  { minWidth: 1024, columns: 5 },
  { minWidth: 768, columns: 4 },
  { minWidth: 640, columns: 3 },
] as const;

const DEFAULT_COLUMNS = 2; // < 640px

function readColumns(): number {
  if (typeof window === "undefined") return DEFAULT_COLUMNS;
  const w = window.innerWidth;
  for (const bp of BREAKPOINTS) {
    if (w >= bp.minWidth) return bp.columns;
  }
  return DEFAULT_COLUMNS;
}

export function useMediaGridColumns(): number {
  const [columns, setColumns] = useState<number>(() => readColumns());

  useEffect(() => {
    if (typeof window === "undefined") return;

    // One MQL per breakpoint boundary; any change triggers a full re-read.
    const mqls = BREAKPOINTS.map((bp) =>
      window.matchMedia(`(min-width: ${bp.minWidth}px)`),
    );
    const sync = () => setColumns(readColumns());
    mqls.forEach((mql) => mql.addEventListener("change", sync));
    // Synchronise once on mount (handles server-render → client hydration gap, if any).
    sync();
    return () => {
      mqls.forEach((mql) => mql.removeEventListener("change", sync));
    };
  }, []);

  return columns;
}
