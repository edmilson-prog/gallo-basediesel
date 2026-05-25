import type { ID, RoleName } from "@/shared/types";
import { readCurrentUserSync } from "@/features/auth/guards";
import { multistoreStore } from "../store/multistoreStore";

export interface ICurrentContext {
  /** Logged-in user (only `id` and `role` are guaranteed). */
  user: { id: ID; role: RoleName } | null;
  /** Active store id resolved by `<MultistoreProvider>`. */
  currentStoreId: ID | null;
}

/**
 * Synchronous accessor for the current user + active store, callable outside
 * React. Used by the mock provider layer (which runs inside data selectors)
 * to apply `withStoreScope` without dragging the React context through every
 * call.
 *
 * Reads:
 *  - `user` from `readCurrentUserSync()` (mirrors `<AuthProvider>` hydration)
 *  - `currentStoreId` from the external `multistoreStore` holder kept in sync
 *    by `<MultistoreProvider>`
 *
 * Never throws — returns `{ user: null, currentStoreId: null }` when the
 * session is empty.
 */
export function getCurrentContext(): ICurrentContext {
  const user = readCurrentUserSync();
  const { currentStoreId } = multistoreStore.getSnapshot();
  return { user, currentStoreId };
}
