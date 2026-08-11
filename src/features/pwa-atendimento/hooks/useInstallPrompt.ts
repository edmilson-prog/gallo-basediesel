import { useCallback, useEffect, useState } from "react";

/** The non-standard event Chromium fires when the app qualifies for install. */
interface IBeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

function detectInstalled(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // iOS Safari predates display-mode and reports this instead.
  return (window.navigator as { standalone?: boolean }).standalone === true;
}

export interface IUseInstallPromptResult {
  /** True when the browser offered us a deferred prompt we can still fire. */
  canPrompt: boolean;
  /** True when the app is already running from the home screen. */
  isInstalled: boolean;
  /** Fires the native install dialog. Resolves once the user decides. */
  prompt: () => Promise<"accepted" | "dismissed" | "unavailable">;
}

/**
 * Wraps the install flow.
 *
 * Only Chromium exposes `beforeinstallprompt`; iOS has no API at all, which is
 * why the install screen also spells out the manual "add to home screen" steps
 * — and why they matter: on iOS a PWA only receives push once installed.
 */
export function useInstallPrompt(): IUseInstallPromptResult {
  const [deferred, setDeferred] = useState<IBeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(detectInstalled);

  useEffect(() => {
    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setDeferred(event as IBeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const prompt = useCallback(async () => {
    if (!deferred) return "unavailable" as const;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // A deferred prompt is single-use, accepted or not.
    setDeferred(null);
    return outcome;
  }, [deferred]);

  return { canPrompt: deferred !== null, isInstalled, prompt };
}
