import { useEffect, useRef } from "react";
import { useRouterState } from "@tanstack/react-router";

/**
 * Scroll progress line pinned to the bottom edge of a sticky header.
 *
 * The app scrolls inside nested containers (not the window), so by default
 * the component walks up the DOM to find the nearest scrollable ancestor —
 * the TopBar case, where the header lives inside the scrolling `<main>`.
 * Layouts whose scroll region is a sibling instead (e.g. the catalog table)
 * pass it explicitly via the `container` prop.
 *
 * Updates write `scaleX` straight to the DOM node — no React re-render per
 * scroll frame — coalesced via requestAnimationFrame. A MutationObserver
 * re-measures when async content (queries) grows the page without a scroll
 * event; route changes re-bind via the pathname dependency.
 */

export interface IScrollProgressBarProps {
  /**
   * Explicit scroll container. `null` means "not mounted yet" and keeps the
   * bar at zero; omit the prop to auto-detect the nearest scrollable ancestor.
   */
  container?: HTMLElement | null;
}

function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  for (let node = el?.parentElement ?? null; node; node = node.parentElement) {
    const overflowY = getComputedStyle(node).overflowY;
    if (overflowY === "auto" || overflowY === "scroll") return node;
  }
  return null;
}

export function ScrollProgressBar({ container }: IScrollProgressBarProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const target = container === undefined ? findScrollParent(trackRef.current) : container;
    if (!target) {
      bar.style.transform = "scaleX(0)";
      return;
    }

    let raf = 0;
    const update = () => {
      raf = 0;
      const max = target.scrollHeight - target.clientHeight;
      // Sub-24px overflows (layout rounding, residual gaps) would make any
      // nudge read as 100% — treat them as "nothing to track".
      const progress = max > 24 ? Math.min(target.scrollTop / max, 1) : 0;
      bar.style.transform = `scaleX(${progress})`;
    };
    const schedule = () => {
      if (raf === 0) raf = requestAnimationFrame(update);
    };

    update();
    target.addEventListener("scroll", schedule, { passive: true });
    const resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(target);

    // A `subtree: true` MutationObserver fires on EVERY descendant change, and
    // each callback reads scrollHeight/clientHeight — a forced reflow per DOM
    // mutation. On a screen whose container never scrolls (Atendimento's <main>
    // is overflow-hidden) that is pure waste: it produced a burst of "Forced
    // reflow" console violations while the Inbox streamed rows in.
    //
    // The ResizeObserver above already catches the container growing, so the
    // MutationObserver is only worth it where there IS overflow to track.
    const hasOverflow = target.scrollHeight - target.clientHeight > 24;
    const mutationObserver = hasOverflow ? new MutationObserver(schedule) : null;
    mutationObserver?.observe(target, { childList: true, subtree: true });

    return () => {
      target.removeEventListener("scroll", schedule);
      resizeObserver.disconnect();
      mutationObserver?.disconnect();
      if (raf !== 0) cancelAnimationFrame(raf);
    };
  }, [pathname, container]);

  return (
    <div
      ref={trackRef}
      aria-hidden
      className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5"
    >
      {/* Initial scaleX(0) is inline — Tailwind v4's `scale-x-0` uses the CSS
          `scale` property, which would keep overriding the JS-driven
          `transform` and pin the bar at zero width. */}
      <div
        ref={barRef}
        style={{ transform: "scaleX(0)" }}
        className="h-full w-full origin-left rounded-r-full bg-gradient-to-r from-primary/60 to-primary shadow-[0_0_8px] shadow-primary/50 transition-transform duration-150 ease-out motion-reduce:transition-none"
      />
    </div>
  );
}
