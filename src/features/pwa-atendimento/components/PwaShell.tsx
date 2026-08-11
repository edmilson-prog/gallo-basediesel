import type { ReactNode } from "react";
import { usePwaManifest } from "../hooks/usePwaManifest";

/**
 * Full-viewport shell of the atendimento PWA.
 *
 * Two deliberate choices live here:
 *
 * 1. **The theme is pinned on this container, not on `<html>`.** `.dark` and
 *    `[data-theme]` are plain class/attribute selectors in `styles.css`, so
 *    redefining the tokens on a wrapper cascades to the whole subtree. Writing
 *    to `<html>` instead would fight `ThemeProvider`, which re-applies its own
 *    attributes whenever the user's theme or mode changes, and would leak the
 *    dark palette into the rest of the SPA if a restore ever failed. The app is
 *    monochrome-with-gold by design, so it also pins the parent brand
 *    (`diesel`) rather than following the user's sub-brand preference.
 * 2. **`fixed inset-0` with `overflow-hidden`.** A messaging app scrolls its
 *    list, never its page: the header, the tab bar and the composer must stay
 *    put while the browser toolbar comes and goes.
 */
export function PwaShell({ children }: { children: ReactNode }) {
  usePwaManifest();

  return (
    <div
      data-theme="diesel"
      className="dark fixed inset-0 z-50 flex flex-col overflow-hidden bg-background text-foreground"
      style={{ colorScheme: "dark" }}
    >
      {children}
    </div>
  );
}
