/**
 * Storefront product feature barrel (PRD-063).
 *
 * Owns `/loja/produto/:slug` — public product detail page with gallery, info,
 * tabs (applications/equivalents/specifications) and related products. Reuses
 * `ProductCard` from `@/features/storefront-search` for the related grid.
 */

export { ProductDetailPage } from "./pages/ProductDetailPage";

export { useRelatedProducts } from "./hooks/useRelatedProducts";
export type { IUseRelatedProductsResult } from "./hooks/useRelatedProducts";
