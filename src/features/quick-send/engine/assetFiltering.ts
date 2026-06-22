import type { AssetCategory, IAssetLibraryItem } from "@/shared/types";
import { isSensitiveAsset } from "./assetSensitivity";

/**
 * Composite asset filter (PRD-027 RF-006/RF-009 base). Filters by
 * category/brand/productLine (exact) and a case-insensitive title query. An
 * empty filter returns the input untouched (order preserved). Pure.
 */

export interface IAssetFilter {
  category?: AssetCategory;
  brand?: string;
  productLine?: string;
  query?: string;
  sensitiveOnly?: boolean;
}

export function filterAssets(
  items: IAssetLibraryItem[],
  filter: IAssetFilter,
): IAssetLibraryItem[] {
  const query = filter.query?.trim().toLowerCase() ?? "";
  return items.filter((item) => {
    if (filter.category && item.category !== filter.category) return false;
    if (filter.brand && item.brand !== filter.brand) return false;
    if (filter.productLine && item.productLine !== filter.productLine) return false;
    if (query.length > 0 && !item.title.toLowerCase().includes(query)) return false;
    if (filter.sensitiveOnly && !isSensitiveAsset(item)) return false;
    return true;
  });
}
