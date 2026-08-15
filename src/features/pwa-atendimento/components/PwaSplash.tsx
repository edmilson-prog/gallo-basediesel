import { useEffect, useState } from "react";
import { PWA_ATENDIMENTO_STRINGS as S } from "../i18n/pt-BR";

const SPLASH_MS = 1900;
const SESSION_KEY = "gallo-atendimento-splash-seen";

/** True the first time the app mounts in this browser session. */
export function shouldShowSplash(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === null;
  } catch {
    // Private mode without storage: show it, it costs 1.9s once.
    return true;
  }
}

function markSplashSeen(): void {
  try {
    window.sessionStorage.setItem(SESSION_KEY, "1");
  } catch {
    /* storage unavailable — the splash simply shows again next launch */
  }
}

/**
 * Opening frame: brand over black with a gold loading rule.
 *
 * An overlay, never a route — as a route it would land in the history stack and
 * the Android back gesture would bounce the user into a splash they already saw.
 */
export function PwaSplash({ onDone }: { onDone: () => void }) {
  const [entered, setEntered] = useState(false);

  useEffect(() => {
    const enter = window.setTimeout(() => setEntered(true), 40);
    const finish = window.setTimeout(() => {
      markSplashSeen();
      onDone();
    }, SPLASH_MS);
    return () => {
      window.clearTimeout(enter);
      window.clearTimeout(finish);
    };
  }, [onDone]);

  return (
    <div className="absolute inset-0 z-[60] flex flex-col items-center justify-center gap-7 overflow-hidden bg-background">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(120% 70% at 50% 34%, color-mix(in oklab, var(--color-primary) 14%, transparent), transparent 62%)",
        }}
        aria-hidden
      />
      <img
        src="/logos/logo-horizontal-white.png"
        alt="GALLO BASE DIESEL"
        className="relative h-8 w-auto transition-all duration-700 ease-out"
        style={{ opacity: entered ? 0.96 : 0, transform: entered ? "none" : "translateY(10px)" }}
      />
      <div className="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 pb-[max(2.125rem,env(safe-area-inset-bottom))]">
        <span className="h-0.5 w-[104px] overflow-hidden rounded-sm bg-foreground/10">
          <span
            className="block h-full bg-primary transition-[width] duration-[1500ms] ease-out"
            style={{ width: entered ? "100%" : "0%" }}
          />
        </span>
        <span className="text-[11px] font-bold uppercase italic tracking-[0.14em] text-muted-foreground/70">
          {S.splashTagline}
        </span>
      </div>
    </div>
  );
}
