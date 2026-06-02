import type { ID, IOrderItem, IPart, ProductSelector } from "@/shared/types";

/**
 * Build the per-item predicate that decides whether an order item counts
 * toward the indicator. Resolves the item's category from the denormalized
 * field (C1) and falls back to the parts catalog (C2) when absent.
 */
export function buildItemMatcher(
  selector: ProductSelector,
  partsMap: Map<ID, IPart>,
): (item: IOrderItem) => boolean {
  return (item: IOrderItem): boolean => {
    const category = item.partCategory ?? partsMap.get(item.partId)?.category;
    switch (selector.kind) {
      case "category":
        return category != null && selector.categories.includes(category);
      case "sku":
        return selector.partIds.includes(item.partId);
      case "group":
        return (
          (category != null && (selector.categories?.includes(category) ?? false)) ||
          (selector.partIds?.includes(item.partId) ?? false)
        );
    }
  };
}
