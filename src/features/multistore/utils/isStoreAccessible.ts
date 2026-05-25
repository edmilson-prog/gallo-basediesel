import type { ID, RoleName } from "@/shared/types";
import { hasPermission } from "@/features/rbac/utils/hasPermission";

/**
 * Decide whether a user is allowed to operate on a given store.
 *
 * Rules:
 *  1. Users with RBAC scope `all` on `store` (Owner) can access any store.
 *  2. Users with an explicit `accessibleStoreIds` list pass iff the store is
 *     in it.
 *  3. Otherwise, only the user's primary `storeId` is accessible.
 *  4. Anonymous users (no `user`) cannot access any store.
 *
 * Used by `<MultistoreProvider>` when validating localStorage and by
 * `setCurrentStore()` before persisting a switch.
 */
export function isStoreAccessible(
  user: { role: RoleName; storeId?: ID; accessibleStoreIds?: ID[] } | null | undefined,
  storeId: ID,
): boolean {
  if (!user) return false;
  if (hasPermission(user, "store", "view", "all")) return true;
  if (user.accessibleStoreIds && user.accessibleStoreIds.length > 0) {
    return user.accessibleStoreIds.includes(storeId);
  }
  return user.storeId === storeId;
}
