import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IPart } from "@/shared/types";
import { usePartsProvider } from "@/providers/data/hooks/usePartsProvider";

const STORE_ID = "store-matriz";
const STALE_MS = 5 * 60 * 1000;
const MAX_RELATED = 4;

export interface IUseRelatedProductsResult {
  isLoading: boolean;
  related: IPart[];
}

/**
 * Related-products picker for the product detail page (PRD-063 RF-017).
 *
 * Ranking:
 *  1. Same category + at least one shared `vehicleBrand` application — top hit.
 *  2. Same category — fallback fill.
 *  3. Same primary OEM prefix — last resort.
 * Always returns up to `MAX_RELATED` items and excludes the source part itself.
 */
export function useRelatedProducts(source: IPart | null): IUseRelatedProductsResult {
  const partsProvider = usePartsProvider();
  const query = useQuery({
    queryKey: ["storefront-product", "related", source?.id ?? "none"] as const,
    queryFn: async () => {
      const r = await partsProvider.list({ storeId: STORE_ID, pageSize: 2000 });
      return r.data;
    },
    staleTime: STALE_MS,
    enabled: Boolean(source),
  });

  const related = useMemo<IPart[]>(() => {
    if (!source) return [];
    const all = query.data ?? [];
    if (all.length === 0) return [];

    const sourceBrands = new Set(source.applications.map((a) => a.vehicleBrand));
    const sourceOemPrefix = (source.oemCodes?.[0] ?? "").slice(0, 3);

    const picked = new Map<string, IPart>();
    const consider = (part: IPart) => {
      if (part.id === source.id) return;
      if (!part.active) return;
      if (picked.size >= MAX_RELATED) return;
      picked.set(part.id, part);
    };

    // Tier 1 — same category + brand overlap.
    if (source.category) {
      for (const part of all) {
        if (part.category !== source.category) continue;
        const overlap = part.applications.some((a) => sourceBrands.has(a.vehicleBrand));
        if (overlap) consider(part);
      }
    }

    // Tier 2 — same category.
    if (source.category && picked.size < MAX_RELATED) {
      for (const part of all) {
        if (part.category !== source.category) continue;
        consider(part);
      }
    }

    // Tier 3 — same OEM prefix.
    if (sourceOemPrefix.length > 0 && picked.size < MAX_RELATED) {
      for (const part of all) {
        const oem = part.oemCodes?.[0] ?? "";
        if (oem.startsWith(sourceOemPrefix)) consider(part);
      }
    }

    return [...picked.values()];
  }, [query.data, source]);

  return {
    isLoading: query.isLoading,
    related,
  };
}
