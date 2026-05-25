import type { IStore } from "@/shared/types";
import { useCurrentStore } from "./useCurrentStore";

/**
 * Convenience accessor — returns just the list of stores the signed-in user
 * can switch into.
 *
 * Equivalent to `useCurrentStore().accessibleStores` but reads better at the
 * call site for components that don't care about the active store.
 */
export function useAccessibleStores(): IStore[] {
  return useCurrentStore().accessibleStores;
}
