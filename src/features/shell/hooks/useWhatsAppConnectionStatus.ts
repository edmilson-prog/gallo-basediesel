import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IWhatsAppAccount } from "@/shared/types";
import { useCurrentStore } from "@/features/multistore";
import { useWhatsAppAccountsProvider } from "@/providers/data";

/**
 * Shared connection-status source for the shell (TopBar icon + global
 * disconnect banner). One TanStack Query — both consumers dedupe into the
 * same 60s refetch — reading the accounts list, which the webhook
 * (connection.update) and the settings-screen polling keep truthful.
 *
 * Snooze model (design review 2026-06-11): muting the banner is PER ACCOUNT
 * for 30min in sessionStorage; a reconnection clears the mute, so the NEXT
 * fall of the same account (or any other account falling) resurfaces the
 * banner immediately instead of hiding behind a global snooze.
 */

const REFRESH_INTERVAL_MS = 60_000;
const MUTE_DURATION_MS = 30 * 60 * 1000;
const MUTE_PREFIX = "gallo-wa-disconnect-muted:";
/** Window event so every hook consumer re-renders on mute changes. */
const MUTE_EVENT = "gallo-wa-disconnect-mute-changed";

export function isDisconnectAlertMuted(accountId: string): boolean {
  const value = sessionStorage.getItem(`${MUTE_PREFIX}${accountId}`);
  return value !== null && Date.now() < Number(value);
}

export function muteDisconnectAlerts(accountIds: string[]): void {
  const until = String(Date.now() + MUTE_DURATION_MS);
  for (const id of accountIds) sessionStorage.setItem(`${MUTE_PREFIX}${id}`, until);
  window.dispatchEvent(new Event(MUTE_EVENT));
}

function clearDisconnectMute(accountId: string): void {
  if (sessionStorage.getItem(`${MUTE_PREFIX}${accountId}`) === null) return;
  sessionStorage.removeItem(`${MUTE_PREFIX}${accountId}`);
  window.dispatchEvent(new Event(MUTE_EVENT));
}

/** Banner copy: name the account when single, aggregate count when 2+. */
export function buildDisconnectBannerCopy(labels: string[]): { headline: string; cta: string } {
  if (labels.length === 1) {
    return { headline: `WhatsApp "${labels[0]}" desconectado.`, cta: "Reconectar" };
  }
  return {
    headline: `${labels.length} números de WhatsApp desconectados.`,
    cta: "Ver e reconectar",
  };
}

export function useWhatsAppConnectionStatus() {
  const { currentStoreId } = useCurrentStore();
  const storeId = currentStoreId ?? "00000000-0000-0000-0000-000000000001";
  const provider = useWhatsAppAccountsProvider();

  const { data } = useQuery({
    queryKey: ["shell", "whatsapp-connection-status", storeId],
    queryFn: () => provider.list({ storeId }),
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
  });

  // Mute changes come from outside React (sessionStorage) — bump to re-render.
  const [, setMuteVersion] = useState(0);
  useEffect(() => {
    const bump = () => setMuteVersion((v) => v + 1);
    window.addEventListener(MUTE_EVENT, bump);
    return () => window.removeEventListener(MUTE_EVENT, bump);
  }, []);

  const accounts: IWhatsAppAccount[] | null = data ?? null;

  // A reconnection ends the snooze episode for that account.
  useEffect(() => {
    for (const account of accounts ?? []) {
      if (account.status === "connected") clearDisconnectMute(account.id);
    }
  }, [accounts]);

  const total = accounts?.length ?? 0;
  const connectedCount = accounts?.filter((a) => a.status === "connected").length ?? 0;
  const disconnected = (accounts ?? []).filter((a) => a.status === "disconnected");
  const alerting = disconnected.filter((a) => !isDisconnectAlertMuted(a.id));
  /** Something is down but every alert was snoozed — residual signal time. */
  const snoozed = disconnected.length > 0 && alerting.length === 0;

  return {
    loading: accounts === null,
    accounts: accounts ?? [],
    total,
    connectedCount,
    disconnected,
    alerting,
    snoozed,
  };
}
