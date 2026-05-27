/**
 * Storefront feature barrel (PRD-060).
 *
 * Public-facing /loja sub-app: home, header/footer, cart state. Owner-only
 * editor at /app/configuracoes/storefront.
 */

export { StorefrontHomePage } from "./pages/StorefrontHomePage";
export { StorefrontConfigPage } from "./pages/StorefrontConfigPage";

export { StorefrontHeader, dispatchFocusSearch } from "./components/StorefrontHeader";
export { StorefrontFooter } from "./components/StorefrontFooter";

export { useStorefrontSettings } from "./hooks/useStorefrontSettings";
export type { IUseStorefrontSettingsResult } from "./hooks/useStorefrontSettings";

export { useStorefrontTheme } from "./hooks/useStorefrontTheme";
export { useSeoMeta } from "./hooks/useSeoMeta";

export { useCartStore, selectCartCount, selectCartSubtotal } from "./store/cartStore";
export type { ICartItem } from "./store/cartStore";
