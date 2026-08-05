import { useCallback, useEffect, useRef } from "react";
import type { IWhatsAppAccount } from "@/shared/types";

/**
 * Silent connection-status polling for WAHA sessions — the parity counterpart
 * of `useEvolutionStatusSync`.
 *
 * That hook structurally CANNOT cover WAHA, twice over:
 * `isEvolutionAccountConfigured` only accepts evolution/evolution-go/openwa,
 * and the account list it reads comes from `whatsappAccountsProvider.list()`,
 * which filters `provider='waha'` out entirely. So a WAHA account's status came
 * exclusively from the `session.status` webhook — one missed delivery (server
 * unreachable, HMAC misconfigured) left the badge stale with no way back short
 * of reloading the screen. Evolution had this safety net since PR #67; WAHA
 * never did.
 *
 * Every 30s while the tab is visible — plus on window focus and on returning
 * from a hidden tab — re-polls each account through the caller's `poll`
 * (`waha-connect?action=state`), which syncs `whatsapp_accounts.status`
 * server-side as a side effect.
 *
 * Deliberately does NOT fire on mount: the section's own `refresh()` already
 * polls right after fetching the list, so an immediate tick here would double
 * every request against the WAHA server.
 *
 * Errors are the caller's to swallow — a flaky poll must not nag the user; the
 * badge simply keeps its last known state.
 */

const POLL_INTERVAL_MS = 30_000;

export function useWahaStatusSync(
  accounts: IWhatsAppAccount[] | null,
  poll: (accounts: IWhatsAppAccount[]) => Promise<void>,
  enabled = true,
) {
  const inFlightRef = useRef(false);
  // Refs keep the interval effect stable across list refreshes.
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;
  const pollRef = useRef(poll);
  pollRef.current = poll;

  const checkNow = useCallback(async () => {
    if (!enabled || inFlightRef.current) return;
    if (typeof document !== "undefined" && document.hidden) return;
    const targets = accountsRef.current ?? [];
    if (targets.length === 0) return;
    inFlightRef.current = true;
    try {
      await pollRef.current(targets);
    } finally {
      inFlightRef.current = false;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let interval: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (interval) return;
      interval = setInterval(() => void checkNow(), POLL_INTERVAL_MS);
    };
    const stop = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden) {
        stop();
      } else {
        start();
        // Coming back from a hidden tab: the badge may be minutes stale.
        void checkNow();
      }
    };
    const onFocus = () => void checkNow();

    if (!document.hidden) start();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, checkNow]);

  return { checkNow };
}
