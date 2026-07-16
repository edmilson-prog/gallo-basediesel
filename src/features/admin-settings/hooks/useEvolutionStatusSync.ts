import { useCallback, useEffect, useRef } from "react";
import type { IWhatsAppAccount } from "@/shared/types";
import { isEvolutionAccountConfigured } from "@/shared/utils/whatsappProvider";
import { getEvolutionState } from "../api/whatsappConnect";

/**
 * Silent connection-status polling for the QR-paired session engines
 * (Evolution v2, Evolution Go and OpenWA) (SIGPRO-style).
 *
 * Every 30s while the tab is visible — plus on window focus and via the
 * manual `checkNow` trigger — asks the whatsapp-connect edge for the live
 * session state of each CONFIGURED Evolution account. The edge syncs
 * `whatsapp_accounts.status` server-side as a side effect; `onSynced` then
 * refreshes the list so the card badges follow reality without F5.
 *
 * Errors are silent by design (no toasts): a flaky poll must not nag the
 * user — the badge simply keeps its last known state.
 */

const POLL_INTERVAL_MS = 30_000;

export function useEvolutionStatusSync(
  accounts: IWhatsAppAccount[] | null,
  onSynced: () => void,
  enabled = true,
) {
  const inFlightRef = useRef(false);
  // Refs keep the interval effect stable across list refreshes.
  const accountsRef = useRef(accounts);
  accountsRef.current = accounts;
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;

  const checkNow = useCallback(async () => {
    if (!enabled || inFlightRef.current) return;
    if (typeof document !== "undefined" && document.hidden) return;
    // A classic Evolution account is pollable once it has a baseUrl; a Go/OpenWA
    // account once it is paired (instanceId/sessionId) — their baseUrl lives in a
    // server registry, NOT in providerConfig, so the old `baseUrl` gate silently
    // excluded them.
    const targets = (accountsRef.current ?? []).filter((account) =>
      isEvolutionAccountConfigured(account),
    );
    if (targets.length === 0) return;
    inFlightRef.current = true;
    try {
      await Promise.all(
        targets.map((account) =>
          getEvolutionState(account.id).catch((err: unknown) => {
            console.warn("[useEvolutionStatusSync] poll failed", account.id, err);
            return null;
          }),
        ),
      );
      onSyncedRef.current();
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
      void checkNow();
    };
    const stop = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };
    const onVisibilityChange = () => {
      if (document.hidden) stop();
      else start();
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
