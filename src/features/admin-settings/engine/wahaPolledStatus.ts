import type { IWhatsAppAccount, WhatsAppAccountStatus } from "@/shared/types";

/** One session state returned by `waha-connect?action=state`. */
export interface IWahaPolledState {
  /** Platform status, already mapped server-side by `wahaStateToAccountStatus`. */
  state: WhatsAppAccountStatus;
  /** Raw WAHA session state (`WORKING`, `SCAN_QR_CODE`, `STARTING`, …). */
  rawState: string;
}

/**
 * Folds freshly polled session states onto the local account rows.
 *
 * `action=state` syncs `whatsapp_accounts.status` server-side AND returns the
 * mapped status, so patching in place keeps the card badge truthful without a
 * second `listWaha()` round-trip. An account whose poll FAILED is simply absent
 * from `polled` and keeps its previous status — a network blip must never be
 * guessed as a disconnection.
 *
 * Returns the original array reference when nothing changed, so a steady-state
 * poll (the common case) costs no re-render.
 */
export function applyWahaPolledStatuses(
  accounts: IWhatsAppAccount[],
  polled: Record<string, IWahaPolledState>,
): IWhatsAppAccount[] {
  let changed = false;
  const next = accounts.map((account) => {
    const result = polled[account.id];
    if (!result || result.state === account.status) return account;
    changed = true;
    return { ...account, status: result.state };
  });
  return changed ? next : accounts;
}
