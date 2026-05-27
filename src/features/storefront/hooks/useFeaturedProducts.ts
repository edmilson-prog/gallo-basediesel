import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, IPart, IStorefrontConfig } from "@/shared/types";
import { useOrdersProvider, usePartsProvider } from "@/providers/data";

const STALE_MS = 10 * 60 * 1000;
const STORE_ID = "store-matriz";
const TARGET_COUNT = 8;
const TOP_SELLING_WINDOW_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface IFeaturedProduct extends IPart {
  /** Tag rendered on the card — driven by the heuristic that surfaced the part. */
  badge?: "top-selling" | "new" | "deal";
}

/**
 * Returns the 8 featured products for the storefront home (PRD-060 RF-013/014).
 *
 * - `mode === 'manual'`: respects `manualPartIds`, in declared order.
 * - `mode === 'top-selling'` (or fallback): ranks parts by units sold in the
 *   last 90 days. Newer/eye-catching items get a contextual badge.
 */
export function useFeaturedProducts(config: IStorefrontConfig["featuredProducts"]): {
  products: IFeaturedProduct[];
  isLoading: boolean;
  isError: boolean;
} {
  const partsProvider = usePartsProvider();
  const ordersProvider = useOrdersProvider();

  const partsQuery = useQuery({
    queryKey: ["storefront", "featured-parts"] as const,
    queryFn: async () => {
      const r = await partsProvider.list({ storeId: STORE_ID, pageSize: 2000 });
      return r.data;
    },
    staleTime: STALE_MS,
  });

  const enableOrders = config.mode === "top-selling" || config.manualPartIds.length === 0;
  const ordersQuery = useQuery({
    queryKey: ["storefront", "featured-orders"] as const,
    queryFn: async () => {
      const r = await ordersProvider.list({ storeId: STORE_ID, pageSize: 2000 });
      return r.data;
    },
    staleTime: STALE_MS,
    enabled: enableOrders,
  });

  const products = useMemo<IFeaturedProduct[]>(() => {
    const parts = partsQuery.data ?? [];
    if (parts.length === 0) return [];

    const partsById = new Map<ID, IPart>();
    for (const p of parts) partsById.set(p.id, p);

    // Manual mode — preserve declared order, drop unknown IDs.
    if (config.mode === "manual" && config.manualPartIds.length > 0) {
      const picked: IFeaturedProduct[] = [];
      for (const id of config.manualPartIds) {
        const part = partsById.get(id);
        if (part) picked.push({ ...part });
        if (picked.length === TARGET_COUNT) break;
      }
      if (picked.length === TARGET_COUNT) return picked;
      // Top-up with top-selling so we always render 8 cards.
      const topUp = computeTopSelling(parts, ordersQuery.data ?? [], partsById).filter(
        (p) => !config.manualPartIds.includes(p.id),
      );
      for (const p of topUp) {
        picked.push(p);
        if (picked.length === TARGET_COUNT) break;
      }
      return picked.slice(0, TARGET_COUNT);
    }

    return computeTopSelling(parts, ordersQuery.data ?? [], partsById).slice(0, TARGET_COUNT);
  }, [config, partsQuery.data, ordersQuery.data]);

  return {
    products,
    isLoading: partsQuery.isLoading || (enableOrders && ordersQuery.isLoading),
    isError: partsQuery.isError || (enableOrders && ordersQuery.isError),
  };
}

function computeTopSelling(
  parts: IPart[],
  orders: import("@/shared/types").IOrder[],
  partsById: Map<ID, IPart>,
): IFeaturedProduct[] {
  const sinceIso = new Date(Date.now() - TOP_SELLING_WINDOW_DAYS * MS_PER_DAY).toISOString();
  const qtyById = new Map<ID, number>();
  for (const order of orders) {
    if (order.paymentStatus !== "pago" && order.paymentStatus !== "parcial") continue;
    const ts = order.paidAt ?? order.updatedAt ?? order.createdAt;
    if (ts < sinceIso) continue;
    for (const item of order.items) {
      qtyById.set(item.partId, (qtyById.get(item.partId) ?? 0) + item.quantity);
    }
  }

  const ranked = [...qtyById.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => partsById.get(id))
    .filter((p): p is IPart => Boolean(p && p.active));

  // Make sure we always have at least 8 candidates: fall back to active parts in catalog order.
  if (ranked.length < TARGET_COUNT) {
    const known = new Set(ranked.map((p) => p.id));
    for (const part of parts) {
      if (known.has(part.id) || !part.active) continue;
      ranked.push(part);
      if (ranked.length === TARGET_COUNT) break;
    }
  }

  const recentCutoffIso = new Date(Date.now() - 30 * MS_PER_DAY).toISOString();
  return ranked.slice(0, TARGET_COUNT).map<IFeaturedProduct>((part, idx) => {
    let badge: IFeaturedProduct["badge"];
    if (idx < 3) badge = "top-selling";
    else if (part.createdAt > recentCutoffIso) badge = "new";
    else if (part.unitPrice < 100) badge = "deal";
    return { ...part, badge };
  });
}
