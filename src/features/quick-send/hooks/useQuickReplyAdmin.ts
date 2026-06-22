import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ID, IQuickReply } from "@/shared/types";
import { useQuickReplyProvider } from "@/providers/data";
import { useAuth } from "@/features/auth/useAuth";
import { getCurrentContext } from "@/features/multistore/utils/getCurrentContext";

/**
 * Admin data hook for the Quick Replies management screen (PRD-027 / P2).
 *
 * Partitions the full list into:
 *  - `mine`  — private snippets owned by the current seller
 *  - `store` — shared snippets visible to the whole store
 *
 * Exposes create / update / remove / duplicateToMine mutations, each of which
 * invalidates the query so the read list stays fresh automatically.
 *
 * Identity: uses the REAL `sellerId` from `useAuth().currentUser?.sellerId`
 * (NOT `getCurrentContext().user?.id`, which is the auth profile id and would
 * break the `mine` filter and the Supabase RLS `owner_id = current_seller_id()`
 * check). `storeId` is threaded into every `create` via `getCurrentContext()`
 * because the Supabase provider does not inject it and will 403 without it.
 *
 * Do NOT modify `useQuickReplies` (the composer read hook) — it is separate.
 */

export interface IUseQuickReplyAdmin {
  mine: IQuickReply[];
  store: IQuickReply[];
  isLoading: boolean;
  isError: boolean;
  /** True when the logged-in user is Owner or Gestor. */
  canEditStore: boolean;
  create(input: {
    shortcut: string;
    title: string;
    body: string;
    scope: "private" | "shared";
  }): Promise<void>;
  update(id: ID, patch: Partial<IQuickReply>): Promise<void>;
  remove(id: ID): Promise<void>;
  duplicateToMine(source: IQuickReply): Promise<void>;
}

export function useQuickReplyAdmin(): IUseQuickReplyAdmin {
  const provider = useQuickReplyProvider();
  const qc = useQueryClient();
  const { currentUser, userRole } = useAuth();

  // REAL sellerId from the seller profile — not the auth user id.
  const sellerId = currentUser?.sellerId ?? "";

  const canEditStore = userRole === "Owner" || userRole === "Gestor";

  // Stable query key — sellerId is a plain string, safe in the dependency array.
  const queryKey = ["quick-send", "replies-admin", sellerId] as const;

  const q = useQuery({
    queryKey,
    queryFn: () => provider.list({ sellerId }),
    enabled: !!sellerId,
  });

  const all = q.data ?? [];

  // Partition: private replies owned by self vs. shared store replies.
  const mine = all.filter((r) => r.scope === "private" && r.ownerId === sellerId);
  const store = all.filter((r) => r.scope === "shared");

  const invalidate = useCallback(
    () => void qc.invalidateQueries({ queryKey: ["quick-send", "replies-admin", sellerId] }),
    [qc, sellerId],
  );

  const create = useCallback(
    async (input: {
      shortcut: string;
      title: string;
      body: string;
      scope: "private" | "shared";
    }): Promise<void> => {
      const storeId = getCurrentContext().currentStoreId;
      // `storeId` is omitted from the public create() type but the Supabase
      // provider requires it for the RLS WITH CHECK — cast to thread it through.
      await provider.create({
        shortcut: input.shortcut,
        title: input.title,
        body: input.body,
        scope: input.scope,
        ownerId: sellerId,
        storeId,
      } as Parameters<typeof provider.create>[0]);
      invalidate();
    },
    [provider, sellerId, invalidate],
  );

  const update = useCallback(
    async (id: ID, patch: Partial<IQuickReply>): Promise<void> => {
      await provider.update(id, patch);
      invalidate();
    },
    [provider, invalidate],
  );

  const remove = useCallback(
    async (id: ID): Promise<void> => {
      await provider.delete(id);
      invalidate();
    },
    [provider, invalidate],
  );

  const duplicateToMine = useCallback(
    async (source: IQuickReply): Promise<void> => {
      // Guard against silently creating a duplicate shortcut among the seller's
      // own replies — the page surfaces a specific toast on this error.
      if (mine.some((r) => r.shortcut === source.shortcut)) {
        throw new Error("shortcut-exists");
      }
      const storeId = getCurrentContext().currentStoreId;
      await provider.create({
        shortcut: source.shortcut,
        title: source.title,
        body: source.body,
        scope: "private",
        ownerId: sellerId,
        storeId,
      } as Parameters<typeof provider.create>[0]);
      invalidate();
    },
    [provider, sellerId, invalidate, mine],
  );

  return {
    mine,
    store,
    isLoading: q.isLoading,
    isError: q.isError,
    canEditStore,
    create,
    update,
    remove,
    duplicateToMine,
  };
}
