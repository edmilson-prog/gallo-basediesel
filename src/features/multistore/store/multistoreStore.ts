import type { ID, IStore } from "@/shared/types";

/**
 * Lightweight pub/sub holder for the active store id and the loaded roster of
 * accessible stores.
 *
 * Lives outside React so non-component code (e.g. mock providers running
 * inside selectors) can read the current store id synchronously via
 * `getCurrentContext()`. Subscribers (the `<MultistoreProvider>` itself) are
 * notified whenever the value mutates, and React state stays in sync via
 * `useSyncExternalStore`.
 *
 * Persistence to localStorage is handled by the provider — this holder is
 * purely in-memory and gets seeded on hydration.
 */

interface IMultistoreSnapshot {
  currentStoreId: ID | null;
  accessibleStores: IStore[];
}

const listeners = new Set<() => void>();

let snapshot: IMultistoreSnapshot = {
  currentStoreId: null,
  accessibleStores: [],
};

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

export const multistoreStore = {
  getSnapshot(): IMultistoreSnapshot {
    return snapshot;
  },

  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  setCurrentStoreId(id: ID | null): void {
    if (snapshot.currentStoreId === id) return;
    snapshot = { ...snapshot, currentStoreId: id };
    emit();
  },

  setAccessibleStores(stores: IStore[]): void {
    snapshot = { ...snapshot, accessibleStores: stores };
    emit();
  },

  reset(): void {
    snapshot = { currentStoreId: null, accessibleStores: [] };
    emit();
  },
};
