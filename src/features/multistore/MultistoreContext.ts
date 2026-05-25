import { createContext } from "react";
import type { ID, IStore } from "@/shared/types";

export interface IMultistoreContextValue {
  /** Active store object. `null` while hydrating or while no user is signed in. */
  currentStore: IStore | null;
  /** Active store id. Mirrors `currentStore?.id ?? null`. */
  currentStoreId: ID | null;
  /** Stores the signed-in user is allowed to switch into. */
  accessibleStores: IStore[];
  /** True until the provider has finished resolving the initial active store. */
  isHydrating: boolean;
  /**
   * Switch the active store. Throws if `storeId` is not in `accessibleStores`.
   * Persists to localStorage, records an audit log entry, and triggers a
   * re-render of consumers.
   */
  setCurrentStore: (storeId: ID) => Promise<void>;
  /** False when only a single store is accessible — disables the dropdown. */
  canSwitchStore: boolean;
}

export const MultistoreContext = createContext<IMultistoreContextValue | null>(null);
