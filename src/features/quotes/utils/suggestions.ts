// src/features/quotes/utils/suggestions.ts
import type { IOrder, IPart, IVehicle } from "@/shared/types";
import { searchPartsByApplication } from "@/features/catalog";

/** Parts compatible with a given vehicle, capped. */
export function buildVehicleSuggestions(parts: IPart[], vehicle: IVehicle, limit = 12): IPart[] {
  return searchPartsByApplication(parts, {
    brand: vehicle.brand,
    model: vehicle.model,
    year: vehicle.year,
  }).slice(0, limit);
}

export interface IRepurchaseSuggestion {
  part: IPart;
  /** How many distinct past orders contained this part. */
  orderCount: number;
  /** Most recent order date that contained it (ISO). */
  lastOrderedAt: string;
}

/**
 * Parts the customer bought before, resolved against the live catalog and
 * ranked by recency then frequency. Parts no longer in `parts` are dropped.
 */
export function buildRepurchaseItems(
  parts: IPart[],
  orders: IOrder[],
  limit = 12,
): IRepurchaseSuggestion[] {
  const byPart = new Map<string, IPart>(parts.map((p) => [p.id, p]));
  const agg = new Map<string, { orderIds: Set<string>; lastOrderedAt: string }>();
  for (const order of orders) {
    for (const item of order.items) {
      if (!byPart.has(item.partId)) continue;
      const entry = agg.get(item.partId) ?? {
        orderIds: new Set<string>(),
        lastOrderedAt: order.createdAt,
      };
      entry.orderIds.add(order.id);
      if (order.createdAt > entry.lastOrderedAt) entry.lastOrderedAt = order.createdAt;
      agg.set(item.partId, entry);
    }
  }
  return [...agg.entries()]
    .map(([partId, e]) => ({
      part: byPart.get(partId)!,
      orderCount: e.orderIds.size,
      lastOrderedAt: e.lastOrderedAt,
    }))
    .sort((a, b) =>
      a.lastOrderedAt === b.lastOrderedAt
        ? b.orderCount - a.orderCount
        : a.lastOrderedAt < b.lastOrderedAt
          ? 1
          : -1,
    )
    .slice(0, limit);
}
