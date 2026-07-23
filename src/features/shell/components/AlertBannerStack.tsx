import { useEffect, useRef } from "react";
import { OutsideHoursBanner } from "@/features/access";
import { IdleCriticalBanner } from "@/features/idle-alerts";
import { WhatsAppDisconnectedBanner } from "./WhatsAppDisconnectedBanner";

const OFFSET_VAR = "--shell-banner-offset";

/**
 * Single sticky anchor for every operational alert banner shown under the
 * TopBar (WhatsApp disconnected, outside work hours, idle conversations
 * backlog). Each banner used to stick to `top-16` independently, so two
 * active at once landed on the exact same offset and fought over it via
 * z-index instead of stacking. Wrapping them once here makes them normal
 * flow siblings — they always stack, never overlap — and the priority order
 * from the old z-index scale (WhatsApp outage > outside-hours > idle
 * backlog) is preserved simply by render order.
 *
 * Fixed-viewport layouts (ConversationLayout, CatalogListPage, ...) size
 * themselves as `calc(100vh-4rem)`, assuming only the 4rem TopBar sits above
 * them. That assumption breaks whenever a banner here is visible, pushing
 * their bottom content (e.g. the message composer) past the viewport edge.
 * Publishing this stack's live rendered height as `--shell-banner-offset`
 * (same direct-DOM-write, rAF-coalesced pattern as ScrollProgressBar — no
 * React re-render per resize) lets those layouts subtract it back out.
 */
export function AlertBannerStack() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const root = document.documentElement;
    let raf = 0;
    const publish = () => {
      raf = 0;
      root.style.setProperty(OFFSET_VAR, `${node.offsetHeight}px`);
    };
    const schedule = () => {
      if (raf === 0) raf = requestAnimationFrame(publish);
    };

    schedule();
    const observer = new ResizeObserver(schedule);
    observer.observe(node);

    return () => {
      observer.disconnect();
      if (raf !== 0) cancelAnimationFrame(raf);
      root.style.setProperty(OFFSET_VAR, "0px");
    };
  }, []);

  return (
    <div ref={ref} className="sticky top-16 z-20 flex flex-col">
      <WhatsAppDisconnectedBanner />
      <OutsideHoursBanner />
      <IdleCriticalBanner />
    </div>
  );
}
