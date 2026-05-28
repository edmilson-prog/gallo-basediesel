/**
 * Storefront category feature barrel (PRD-062).
 *
 * Owns `/loja/categoria/:slug` — category listings + the three curated
 * special listings (`mais-vendidas`, `novidades`, `promocoes`). Reuses
 * `ProductCard` from `@/features/storefront-search`.
 */

export { CategoryListingPage } from "./pages/CategoryListingPage";

export {
  resolveCategorySlug,
  iconForSlug,
  nameForSlug,
  CATEGORY_TO_SLUG,
  KNOWN_CATEGORY_SLUGS,
  KNOWN_SPECIAL_SLUGS,
} from "./data/slugs";
export type {
  ICategorySlugMapping,
  ICategorySlugMappingRegular,
  ICategorySlugMappingSpecial,
  SpecialKind,
} from "./data/slugs";

export { useCategoryFilters, validateCategorySearch } from "./hooks/useCategoryFilters";
export type {
  CategorySort,
  CategoryType,
  ICategoryFiltersState,
  ICategorySearchParams,
  IUseCategoryFiltersResult,
} from "./hooks/useCategoryFilters";

export { useCategoryResults, CATEGORY_PAGE_SIZE } from "./hooks/useCategoryResults";
export type { IUseCategoryResultsResult } from "./hooks/useCategoryResults";
