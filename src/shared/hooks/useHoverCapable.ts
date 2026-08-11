import { useEffect, useState } from "react";

/**
 * The honest test for "this device has a hovering pointer". A width threshold
 * would be a proxy that errs both ways: a touchscreen laptop is wide and has no
 * reliable hover, a tablet driven by a trackpad is narrow and does.
 */
const HOVER_QUERY = "(hover: hover) and (pointer: fine)";

function readHoverCapability(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia(HOVER_QUERY).matches;
}

/**
 * True when the device has a real hovering, fine pointer (mouse or trackpad).
 *
 * Reactive: plugging a mouse into a tablet, or docking a 2-in-1, flips the match
 * without a reload. Defaults to `false` when `matchMedia` is unavailable —
 * failing closed means a hover-only affordance never becomes the ONLY way to
 * reach something.
 */
export function useHoverCapable(): boolean {
  const [capable, setCapable] = useState<boolean>(readHoverCapability);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(HOVER_QUERY);
    const sync = () => setCapable(mql.matches);
    mql.addEventListener("change", sync);
    sync();
    return () => mql.removeEventListener("change", sync);
  }, []);

  return capable;
}
