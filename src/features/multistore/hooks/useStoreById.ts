import type { ID, IStore } from "@/shared/types";
import { useAccessibleStores } from "./useAccessibleStores";

/**
 * Look up a store by id from the accessible roster.
 *
 * Useful for `<StoreBadge>` instances that render alongside cross-store
 * lists (Fase 2 — Visão Executiva). On the MVP only the matriz is in scope,
 * so the lookup is degenerate but kept consistent for forward-compat.
 *
 * Returns `null` when the store is not in the user's accessible set.
 */
export function useStoreById(storeId: ID | null | undefined): IStore | null {
  const stores = useAccessibleStores();
  if (!storeId) return null;
  return stores.find((s) => s.id === storeId) ?? null;
}
