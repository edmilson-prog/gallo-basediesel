/**
 * GALLO BASE DIESEL — Public surface of the multi-store layer (PRD-007).
 *
 * Features MUST consume multi-store functionality exclusively through this
 * barrel:
 *
 *   import { useCurrentStore, withStoreScope } from "@/features/multistore";
 *
 * @see ../../../docs/multistore.md
 */

export { MultistoreProvider } from "./MultistoreProvider";
export { useCurrentStore } from "./hooks/useCurrentStore";
export { useAccessibleStores } from "./hooks/useAccessibleStores";
export { useStoreById } from "./hooks/useStoreById";

export { withStoreScope } from "./utils/withStoreScope";
export { getCurrentContext } from "./utils/getCurrentContext";
export { getStoreForUser } from "./utils/getStoreForUser";
export { isStoreAccessible } from "./utils/isStoreAccessible";

export { StoreSwitcher } from "./components/StoreSwitcher";
export { StoreBadge } from "./components/StoreBadge";
export { StoresPage } from "./pages/StoresPage";

export { CURRENT_STORE_LOCALSTORAGE_KEY, NO_USER_STORE_ID } from "./config";

export type { IMultistoreContextValue } from "./MultistoreContext";
