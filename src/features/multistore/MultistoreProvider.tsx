import { useCallback, useEffect, useMemo, useState } from "react";
import type { ID, IStore } from "@/shared/types";
import { useAuth } from "@/features/auth/useAuth";
import { useStoresProvider } from "@/providers/data";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { hasPermission } from "@/features/rbac/utils/hasPermission";
import { CURRENT_STORE_LOCALSTORAGE_KEY } from "./config";
import { MultistoreContext, type IMultistoreContextValue } from "./MultistoreContext";
import { multistoreStore } from "./store/multistoreStore";

function readPersistedStoreId(): ID | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CURRENT_STORE_LOCALSTORAGE_KEY);
  } catch {
    return null;
  }
}

function persistStoreId(id: ID | null): void {
  if (typeof window === "undefined") return;
  try {
    if (id === null) window.localStorage.removeItem(CURRENT_STORE_LOCALSTORAGE_KEY);
    else window.localStorage.setItem(CURRENT_STORE_LOCALSTORAGE_KEY, id);
  } catch {
    // localStorage may be unavailable (private mode). Session-only fallback.
  }
}

/**
 * Resolve the set of stores the signed-in user can switch into.
 *
 * - Owner (RBAC scope `all` on `store`) sees every store loaded from the
 *   provider — cross-store visibility.
 * - Other staff see exactly the stores listed on `accessibleStoreIds`, or
 *   their primary store as a fallback.
 * - Customers (no `accessibleStoreIds`, no `all` scope) get an empty list —
 *   the StoreSwitcher is hidden on the public Loja layout.
 */
function computeAccessibleStores(
  allStores: IStore[],
  user: { role: string; storeId?: ID; accessibleStoreIds?: ID[] } | null,
): IStore[] {
  if (!user) return [];
  if (hasPermission(user as { role: never }, "store", "view", "all")) {
    return allStores;
  }
  const ids = user.accessibleStoreIds ?? (user.storeId ? [user.storeId] : []);
  if (ids.length === 0) return [];
  const idSet = new Set(ids);
  return allStores.filter((s) => idSet.has(s.id));
}

/**
 * `<MultistoreProvider>` — owns the current active store for the session.
 *
 * Sits between `<AuthProvider>` (depends on the signed-in user) and the route
 * tree (consumers may render anywhere downstream). Loads the full store
 * roster from `useStoresProvider()`, resolves the user's accessible set,
 * picks the initial active store from localStorage (with fallback to the
 * user's primary store), and exposes a reactive `setCurrentStore`.
 *
 * Mirrors `<AuthProvider>` semantics: re-emits on user change, swallows
 * localStorage failures, and never blocks rendering while hydrating — the
 * `isHydrating` flag lets consumers render skeletons if they care.
 *
 * @see docs/multistore.md
 */
export function MultistoreProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAuth();
  const storesProvider = useStoresProvider();
  const [allStores, setAllStores] = useState<IStore[]>([]);
  const [currentStoreId, setCurrentStoreIdState] = useState<ID | null>(null);
  const [isHydrating, setIsHydrating] = useState(true);

  // Load the full store roster once on mount. The roster is tiny on the MVP
  // (a single matriz) so eager loading is fine; Fase 2 may add a refresh
  // hook once filiais and parceiras come online.
  useEffect(() => {
    let cancelled = false;
    void storesProvider
      .list()
      .then((stores) => {
        if (cancelled) return;
        setAllStores(stores);
        multistoreStore.setAccessibleStores(stores);
      })
      .catch(() => {
        if (cancelled) return;
        setAllStores([]);
      });
    return () => {
      cancelled = true;
    };
  }, [storesProvider]);

  const accessibleStores = useMemo(
    () => computeAccessibleStores(allStores, currentUser),
    [allStores, currentUser],
  );

  // Keep the external store in sync so non-React consumers (mock providers
  // running inside selectors) can read the accessible roster too.
  useEffect(() => {
    multistoreStore.setAccessibleStores(accessibleStores);
  }, [accessibleStores]);

  // Resolve the initial active store whenever the user changes or the
  // accessible roster finishes loading. Order of preference:
  //   1. localStorage value, if still accessible
  //   2. user's primary `storeId`, if accessible
  //   3. first accessible store
  //   4. null (no user / no stores)
  useEffect(() => {
    if (!currentUser) {
      setCurrentStoreIdState(null);
      multistoreStore.setCurrentStoreId(null);
      setIsHydrating(false);
      return;
    }
    if (accessibleStores.length === 0) {
      // Roster may still be loading; keep hydrating flag on.
      return;
    }
    const accessibleIds = new Set(accessibleStores.map((s) => s.id));
    const persisted = readPersistedStoreId();
    let resolved: ID | null = null;
    if (persisted && accessibleIds.has(persisted)) {
      resolved = persisted;
    } else {
      if (persisted && !accessibleIds.has(persisted)) {
        persistStoreId(null);
      }
      const primary = currentUser.storeId;
      if (primary && accessibleIds.has(primary)) {
        resolved = primary;
      } else {
        resolved = accessibleStores[0]?.id ?? null;
      }
    }
    setCurrentStoreIdState(resolved);
    multistoreStore.setCurrentStoreId(resolved);
    setIsHydrating(false);
  }, [currentUser, accessibleStores]);

  const setCurrentStore = useCallback(
    async (storeId: ID): Promise<void> => {
      const accessibleIds = new Set(accessibleStores.map((s) => s.id));
      if (!accessibleIds.has(storeId)) {
        throw new Error(`Loja "${storeId}" não é acessível ao usuário atual.`);
      }
      if (currentStoreId === storeId) return;
      const previous = currentStoreId;
      setCurrentStoreIdState(storeId);
      multistoreStore.setCurrentStoreId(storeId);
      persistStoreId(storeId);
      auditLog({
        action: "switch_store",
        resource: "store",
        resourceId: storeId,
        before: { storeId: previous },
        after: { storeId },
        storeId,
      });
    },
    [accessibleStores, currentStoreId],
  );

  const currentStore = useMemo(
    () => accessibleStores.find((s) => s.id === currentStoreId) ?? null,
    [accessibleStores, currentStoreId],
  );

  const value = useMemo<IMultistoreContextValue>(
    () => ({
      currentStore,
      currentStoreId,
      accessibleStores,
      isHydrating,
      setCurrentStore,
      canSwitchStore: accessibleStores.length > 1,
    }),
    [currentStore, currentStoreId, accessibleStores, isHydrating, setCurrentStore],
  );

  return <MultistoreContext.Provider value={value}>{children}</MultistoreContext.Provider>;
}
