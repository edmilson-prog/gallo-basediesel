import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { ID, IPixKey } from "@/shared/types";
import { usePixKeyProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { usePixKeys } from "./usePixKeys";

/** Everything the editor form owns. The rest is server/context-derived. */
export type PixKeyDraft = Omit<IPixKey, "id" | "storeId" | "createdBy" | "createdAt" | "updatedAt">;

export interface IUsePixKeyAdmin {
  keys: IPixKey[];
  isLoading: boolean;
  isError: boolean;
  /** True when the logged-in user is Owner or Gestor. */
  canManage: boolean;
  create(input: PixKeyDraft): Promise<void>;
  update(id: ID, patch: Partial<IPixKey>): Promise<void>;
  remove(id: ID): Promise<void>;
}

/**
 * Admin data hook for the PIX keys settings screen.
 *
 * Mirrors `useQuickReplyAdmin`: plain `useCallback` wrappers over the provider
 * plus a `queryClient.invalidateQueries` after each write. Toasts stay in the
 * page, not here — the hook reports failure by rejecting, the same contract the
 * quick-reply screen already relies on.
 *
 * Identity: `createdBy` is the REAL `sellerId` from the seller profile, not the
 * auth profile id — `pix_keys.created_by` is an FK to `public.sellers(id)` and
 * an auth id there is a 409. `storeId` is threaded into `create` explicitly
 * because the Supabase provider reads it off the input to satisfy the RLS
 * `with check (store_id = current_store_id())`; the mock provider injects it
 * via `withCreateStoreId`, so passing it is correct on both backends.
 *
 * Unlike `useQuickReplyAdmin` this reads the store from `useCurrentStore()`
 * instead of the synchronous `getCurrentContext()`: we are already inside React
 * here, and the hook form re-renders when the user switches store.
 */
export function usePixKeyAdmin(): IUsePixKeyAdmin {
  const provider = usePixKeyProvider();
  const qc = useQueryClient();
  const { currentUser, hasRole } = useAuth();
  const { currentStoreId } = useCurrentStore();
  const { keys, isLoading, isError } = usePixKeys();

  const sellerId = currentUser?.sellerId ?? "";
  const canManage = hasRole(["Owner", "Gestor"]);

  const invalidate = useCallback(() => {
    // Prefix match (no storeId): busts every store's cached list, so switching
    // store right after a write never shows a stale roster.
    void qc.invalidateQueries({ queryKey: ["pix", "keys"] });
  }, [qc]);

  /**
   * Exactly one default key per store. There is no DB constraint for this
   * (see 20260807130000_create_pix_keys_table.sql), so it is enforced here:
   * two defaults would make `activeKeys[0]` — the key the composer preselects —
   * depend on alphabetical luck.
   *
   * Order matters: the promotion is written FIRST and the demotions after, so
   * the transient state is "two defaults" rather than "no default". A send that
   * races this picks a real key either way.
   */
  const demoteOtherDefaults = useCallback(
    async (keepId: ID): Promise<void> => {
      const stale = keys.filter((k) => k.isDefault && k.id !== keepId);
      await Promise.all(stale.map((k) => provider.update(k.id, { isDefault: false })));
    },
    [keys, provider],
  );

  const create = useCallback(
    async (input: PixKeyDraft): Promise<void> => {
      if (!currentStoreId) throw new Error("pix: no active store");
      const created = await provider.create({
        ...input,
        createdBy: sellerId,
        // `storeId` is stripped from the contract's create input; cast to thread
        // it through, the same way useQuickReplyAdmin does.
        storeId: currentStoreId,
      } as Parameters<typeof provider.create>[0]);
      if (created.isDefault) await demoteOtherDefaults(created.id);
      invalidate();
    },
    [provider, sellerId, currentStoreId, demoteOtherDefaults, invalidate],
  );

  const update = useCallback(
    async (id: ID, patch: Partial<IPixKey>): Promise<void> => {
      const updated = await provider.update(id, patch);
      if (updated.isDefault) await demoteOtherDefaults(updated.id);
      invalidate();
    },
    [provider, demoteOtherDefaults, invalidate],
  );

  const remove = useCallback(
    async (id: ID): Promise<void> => {
      await provider.delete(id);
      invalidate();
    },
    [provider, invalidate],
  );

  return { keys, isLoading, isError, canManage, create, update, remove };
}
