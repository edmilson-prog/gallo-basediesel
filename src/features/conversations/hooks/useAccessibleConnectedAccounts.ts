import { useEffect, useMemo, useState } from "react";
import type { ID, IWhatsAppAccount } from "@/shared/types";
import { useWhatsAppAccountsProvider } from "@/providers/data";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { selectAccessibleAccounts } from "../utils/selectAccessibleAccounts";

export interface IAccessibleConnectedAccountsResult {
  /** All store-wide WhatsApp accounts (base + WAHA), regardless of access —
   *  needed to resolve origin labels for conversations on instances the
   *  current user cannot staff. */
  accounts: IWhatsAppAccount[];
  /** Instances the current user may operate (PRD-011 multi-access). Staff
   *  (store-wide view) see the full store-wide set; `null` while still
   *  loading for a non-staff user. */
  accessibleIds: Set<ID> | null;
  accessibleAccounts: IWhatsAppAccount[];
  /** `accessibleAccounts` filtered to `status === "connected"` — the set
   *  eligible to start a new outbound conversation from. */
  accessibleConnectedAccounts: IWhatsAppAccount[];
  isStaffView: boolean;
}

/**
 * Loads the store's WhatsApp accounts (base + WAHA) and narrows them to the
 * ones the current user may operate and are connected. Shared by every place
 * that opens `NewConversationDialog` (the Inbox's own "Nova conversa" button
 * and the "Abrir conversa" shortcut on a shared-contact bubble) so the PRD-011
 * access rule lives in one place instead of drifting between copies.
 *
 * `enabled` (default `true`) gates both fetches — pass `false` for a call site
 * that only needs the list on-demand (e.g. a dialog that isn't open yet), so
 * mounting the hook doesn't cost a network round-trip nobody asked for.
 */
export function useAccessibleConnectedAccounts(
  storeId: ID,
  enabled = true,
): IAccessibleConnectedAccountsResult {
  const whatsappAccountsProvider = useWhatsAppAccountsProvider();
  const [accounts, setAccounts] = useState<IWhatsAppAccount[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    // WAHA sessions are excluded from the generic `list()` (its `neq('provider','waha')`
    // shields callers with provider-specific logic that breaks on a WAHA row) — folded
    // back in here via the dedicated `listWaha`, fail-safe on its own.
    void Promise.all([
      whatsappAccountsProvider.list({ storeId }),
      whatsappAccountsProvider.listWaha({ storeId }).catch(() => [] as IWhatsAppAccount[]),
    ])
      .then(([base, waha]) => {
        if (!cancelled) setAccounts([...base, ...waha]);
      })
      .catch(() => {
        if (!cancelled) setAccounts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [whatsappAccountsProvider, storeId, enabled]);

  const isStaffView = usePermission("conversation", "view", "store");
  // `null` = still loading (no instances shown yet, avoids flashing unauthorized
  // ones). On error we fail closed (empty set). UX gate only — conversation
  // access is enforced in the DB (can_access_conversation).
  const [accessibleIds, setAccessibleIds] = useState<Set<ID> | null>(null);
  useEffect(() => {
    if (!enabled) return;
    // Staff bypass the RPC: it is scoped by the JWT's store and cannot follow a
    // client-side store switch, so staff just use the (store-scoped) accounts.
    if (isStaffView) return;
    let cancelled = false;
    void whatsappAccountsProvider
      .listAccessibleAccountIds()
      .then((ids) => {
        if (!cancelled) setAccessibleIds(new Set(ids));
      })
      .catch(() => {
        if (!cancelled) setAccessibleIds(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, [whatsappAccountsProvider, isStaffView, enabled]);

  const accessibleAccounts = useMemo(
    () => (isStaffView ? accounts : selectAccessibleAccounts(accounts, accessibleIds)),
    [isStaffView, accounts, accessibleIds],
  );
  const accessibleConnectedAccounts = useMemo(
    () => accessibleAccounts.filter((a) => a.status === "connected"),
    [accessibleAccounts],
  );

  return { accounts, accessibleIds, accessibleAccounts, accessibleConnectedAccounts, isStaffView };
}
