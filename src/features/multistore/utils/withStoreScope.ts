import type { ID, RoleName } from "@/shared/types";
import { hasPermission } from "@/features/rbac/utils/hasPermission";
import type { ResourceName } from "@/features/rbac/permissions/resources";
import { NO_USER_STORE_ID } from "../config";

export interface IScopeContext {
  user: { id: ID; role: RoleName } | null;
  currentStoreId: ID | null;
  /** RBAC resource the query refers to (e.g. `'customer'`, `'order'`). */
  resource: ResourceName;
}

/**
 * Apply an implicit `storeId` filter to a list query, honoring the RBAC scope
 * of the calling user.
 *
 * Behaviour matrix:
 *  - **Anonymous user** → forces `storeId = NO_USER_STORE_ID`, guaranteeing an
 *    empty result. Never lets unauthenticated callers leak data.
 *  - **User with scope `all` on the resource** (Owner) → returns the params
 *    untouched, enabling cross-store listings.
 *  - **Everyone else** → injects `storeId = currentStoreId`, restricting the
 *    query to the active store.
 *
 * The TypeScript signature preserves the input shape so callers keep their
 * existing param typings intact.
 *
 * @see docs/multistore.md#withstorescope
 */
export function withStoreScope<T extends Record<string, unknown>>(
  params: T,
  context: IScopeContext,
): T & { storeId?: ID } {
  if (!context.user) {
    return { ...params, storeId: NO_USER_STORE_ID };
  }
  if (hasPermission(context.user, context.resource, "view", "all")) {
    return params;
  }
  return { ...params, storeId: context.currentStoreId ?? NO_USER_STORE_ID };
}
