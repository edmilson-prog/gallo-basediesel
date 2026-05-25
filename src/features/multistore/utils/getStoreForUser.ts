import type { ID } from "@/shared/types";

/**
 * Resolve the primary store id of a user-like object.
 *
 * Any shape with a `storeId` field qualifies (seller, customer, mock profile)
 * — keeps the helper decoupled from the auth representation.
 *
 * Returns `null` when the user has no primary store (e.g. customers browsing
 * the public storefront before they sign in).
 */
export function getStoreForUser(user: { storeId?: ID } | null | undefined): ID | null {
  return user?.storeId ?? null;
}
