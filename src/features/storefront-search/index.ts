/**
 * Storefront search feature barrel (PRD-061).
 *
 * Owns the public catalog search experience at `/loja/busca`. Exposes the
 * reusable `ProductCard` (shared with PRD-062 listing) and the URL-validator
 * for the route's search params.
 */

export { SearchResultsPage } from "./pages/SearchResultsPage";
export { ProductCard } from "./components/ProductCard";
export type { IProductCardProps } from "./components/ProductCard";

export { useSearchFilters, validateSearchSearch } from "./hooks/useSearchFilters";
export type {
  ISearchSearchParams,
  ISearchFiltersState,
  IUseSearchFiltersResult,
  SearchSort,
  SearchType,
} from "./hooks/useSearchFilters";

export { useSearchResults, SEARCH_PAGE_SIZE } from "./hooks/useSearchResults";
export type { IUseSearchResultsResult } from "./hooks/useSearchResults";
