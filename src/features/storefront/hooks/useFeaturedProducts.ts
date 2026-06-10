import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, IPart, IStorefrontConfig } from "@/shared/types";
import { useStorefrontProvider } from "@/providers/data";

const STALE_MS = 10 * 60 * 1000;
const STORE_ID = "00000000-0000-0000-0000-000000000001";
const TARGET_COUNT = 8;
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
  const storefrontProvider = useStorefrontProvider();

  const partsQuery = useQuery({
    queryKey: ["storefront", "featured-parts"] as const,
    queryFn: () => storefrontProvider.listCatalog(),
    staleTime: STALE_MS,
  });

  const enableTopSelling = config.mode === "top-selling" || config.manualPartIds.length === 0;
  const topSellingQuery = useQuery({
    queryKey: ["storefront", "featured-top-selling"] as const,
    queryFn: () => storefrontProvider.listTopSellingIds(STORE_ID),
    staleTime: STALE_MS,
    enabled: enableTopSelling,
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
      const topUp = computeTopSelling(parts, topSellingQuery.data ?? [], partsById).filter(
        (p) => !config.manualPartIds.includes(p.id),
      );
      for (const p of topUp) {
        picked.push(p);
        if (picked.length === TARGET_COUNT) break;
      }
      return picked.slice(0, TARGET_COUNT);
    }

    return computeTopSelling(parts, topSellingQuery.data ?? [], partsById).slice(0, TARGET_COUNT);
  }, [config, partsQuery.data, topSellingQuery.data]);

  return {
    products,
    isLoading: partsQuery.isLoading || (enableTopSelling && topSellingQuery.isLoading),
    isError: partsQuery.isError || (enableTopSelling && topSellingQuery.isError),
  };
}

function computeTopSelling(
  parts: IPart[],
  topSellingIds: ID[],
  partsById: Map<ID, IPart>,
): IFeaturedProduct[] {
  // `topSellingIds` is already ranked by units sold (desc), computed server-side
  // (mock reproduces the same ranking) — just resolve to active parts in order.
  const ranked: IPart[] = [];
  for (const id of topSellingIds) {
    const part = partsById.get(id);
    if (part && part.active) ranked.push(part);
  }

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
