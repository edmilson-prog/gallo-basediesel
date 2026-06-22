import { useEffect } from "react";

/**
 * Gestures the browser accepts as "user activation" for the autoplay policy.
 * Passive motion (mousemove/scroll/wheel) does NOT qualify: calling
 * AudioContext.resume() on those makes Chrome log
 * "The AudioContext was not allowed to start". They still count as activity for
 * the idle timer (see useActivityTracker) — they just can't unlock audio.
 */
const GESTURE_EVENTS = ["pointerdown", "keydown", "touchstart"] as const;

/**
 * Resumes the AudioContext only on qualifying user gestures, so the autoplay
 * policy is never violated. `unlock` is idempotent (no-op once running), so
 * listeners stay attached to recover from a later browser-initiated suspend.
 */
export function useAudioUnlock(unlock: () => void, enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;
    const handler = () => unlock();
    for (const ev of GESTURE_EVENTS) {
      window.addEventListener(ev, handler, { passive: true });
    }
    return () => {
      for (const ev of GESTURE_EVENTS) window.removeEventListener(ev, handler);
    };
  }, [unlock, enabled]);
}
