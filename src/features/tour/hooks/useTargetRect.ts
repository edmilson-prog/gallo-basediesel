// src/features/tour/hooks/useTargetRect.ts
import { useEffect, useState } from "react";

// Measures and tracks a [data-tour="<id>"] element. Polls with rAF until the
// element exists (screens load async), then follows it on resize/scroll.
// Returns null when there is no target id, the tour is inactive, or the
// element never appeared within the timeout (caller treats null as "centered").
export function useTargetRect(targetId: string | undefined, active: boolean): DOMRect | null {
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!active || !targetId) {
      setRect(null);
      return;
    }
    const selector = `[data-tour="${targetId}"]`;
    const TIMEOUT = 3000;
    const start = performance.now();
    let raf = 0;
    let cancelled = false;

    const read = (): boolean => {
      const el = document.querySelector(selector);
      if (el) {
        setRect(el.getBoundingClientRect());
        return true;
      }
      return false;
    };

    const poll = () => {
      if (cancelled) return;
      if (read()) return;
      if (performance.now() - start > TIMEOUT) {
        setRect(null);
        return;
      }
      raf = requestAnimationFrame(poll);
    };
    poll();

    const onChange = () => {
      const el = document.querySelector(selector);
      if (el) setRect(el.getBoundingClientRect());
    };
    window.addEventListener("resize", onChange);
    window.addEventListener("scroll", onChange, true);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onChange);
      window.removeEventListener("scroll", onChange, true);
    };
  }, [targetId, active]);

  return rect;
}
