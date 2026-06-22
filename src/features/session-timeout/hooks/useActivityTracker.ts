import { useEffect } from "react";

/** User-input events that count as activity. All passive (no preventDefault). */
const ACTIVITY_EVENTS = [
  "mousemove",
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "wheel",
] as const;

/**
 * Calls `onActivity` (throttled) on any real user interaction in this tab.
 * No-op while `enabled` is false. `onActivity` should be stable (useCallback).
 */
export function useActivityTracker(
  onActivity: () => void,
  enabled: boolean,
  throttleMs = 1_000,
): void {
  useEffect(() => {
    if (!enabled) return;
    let last = 0;
    const handler = () => {
      const now = Date.now();
      if (now - last < throttleMs) return;
      last = now;
      onActivity();
    };
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, handler, { passive: true });
    }
    return () => {
      for (const ev of ACTIVITY_EVENTS) window.removeEventListener(ev, handler);
    };
  }, [onActivity, enabled, throttleMs]);
}
