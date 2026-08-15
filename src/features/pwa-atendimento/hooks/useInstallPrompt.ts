import { useCallback, useState, useSyncExternalStore } from "react";
import {
  consumeInstallPrompt,
  getInstallState,
  subscribeInstallState,
} from "@/shared/lib/installPrompt";

/** True only while this document is the window opened from the home screen. */
function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // iOS Safari predates display-mode and reports this instead.
  return (window.navigator as { standalone?: boolean }).standalone === true;
}

export interface IUseInstallPromptResult {
  /** True when the browser has an offer we can still fire. */
  canPrompt: boolean;
  /** True when this device already has the atendimento app. */
  isInstalled: boolean;
  /** Fires the native install dialog. Resolves once the user decides. */
  prompt: () => Promise<"accepted" | "dismissed" | "unavailable">;
}

/**
 * Wraps the install flow.
 *
 * The browser's offer is captured at module scope by `@/shared/lib/installPrompt`
 * — before React exists — and this hook only subscribes to it. That indirection
 * is the whole point: `beforeinstallprompt` fires once per page load and is
 * never repeated, so a listener that came and went with a component missed it
 * for good. Any screen can now ask, at any moment, and get the same answer.
 *
 * Only Chromium exposes the event; iOS has no API at all, which is why the
 * install screen also spells out the manual "add to home screen" steps — and
 * why they matter: on iOS a PWA only receives push once installed.
 */
export function useInstallPrompt(): IUseInstallPromptResult {
  const state = useSyncExternalStore(subscribeInstallState, getInstallState, getInstallState);
  // Fixed for the life of the document: a tab does not become standalone.
  const [standalone] = useState(detectStandalone);

  const prompt = useCallback(async () => {
    const offer = getInstallState().prompt;
    if (!offer) return "unavailable" as const;
    await offer.prompt();
    const { outcome } = await offer.userChoice;
    consumeInstallPrompt();
    return outcome;
  }, []);

  return {
    canPrompt: state.prompt !== null,
    // A browser tab cannot see an installed app directly, so we fall back to
    // the install we witnessed. Blind spot worth knowing: an install done in
    // another browser, or wiped site data, reads as "not installed" — the app
    // over-offers rather than hiding the way in.
    isInstalled: standalone || state.installedScopes.includes("/atendimento"),
    prompt,
  };
}
