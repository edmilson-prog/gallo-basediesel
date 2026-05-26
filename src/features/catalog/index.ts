/**
 * Catalog feature barrel (PRD-030).
 *
 * Consumers (PRD-021 identification, PRD-016 vehicles tab, PRD-031 quote) should
 * import search helpers from `@/features/catalog/api/search` and UI primitives
 * (PartImage, StockBadge) from this barrel.
 */

export {
  findByOemCode,
  findByAlternativeCode,
  getEquivalents,
  searchPartsByApplication,
  searchPartsByText,
  type IApplicationSearchInput,
} from "./api/search";

export { PartImage } from "./components/PartImage";
export { StockBadge } from "./components/StockBadge";

export {
  PART_CATEGORY_DESCRIPTORS,
  getCategoryDescriptor,
  getCategoryIcon,
  getCategoryLabel,
  getSubcategoriesFor,
  type IPartCategoryDescriptor,
} from "./utils/categories";
