/**
 * Storefront Admin feature barrel (PRD-066).
 *
 * Consolidated e-commerce admin panel at `/app/storefront-admin` — dashboard,
 * content (reuses PRD-060/062 editors), coupons/campaigns placeholders and
 * analysis. Replaces the standalone `/app/configuracoes/storefront` editor.
 */
export { StorefrontAdminPage } from "./pages/StorefrontAdminPage";
export type { IStorefrontAdminSearch } from "./pages/StorefrontAdminPage";
export { useEcommerceMetrics } from "./hooks/useEcommerceMetrics";
export type { IEcommerceMetrics, IEcommerceDailyPoint } from "./hooks/useEcommerceMetrics";
