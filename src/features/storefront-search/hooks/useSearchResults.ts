import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, IPart } from "@/shared/types";
import { useStorefrontProvider } from "@/providers/data";
import { findByOemCode, searchPartsByApplication, searchPartsByText } from "@/features/catalog";
import type { ISearchFiltersState } from "./useSearchFilters";

const STORE_ID = "00000000-0000-0000-0000-000000000001";
const STALE_MS = 5 * 60 * 1000;
const PAGE_SIZE = 24;

export interface IUseSearchResultsResult {
  isLoading: boolean;
  isError: boolean;
  /** All parts the engine considered for this query (post search-engine, pre-filter). */
  matchCount: number;
  /** Final filtered result (after sidebar filters) — used for the count badge. */
  totalCount: number;
  /** Slice for the current page. */
  pageItems: IPart[];
  pageCount: number;
}

/**
 * Engine that powers `/loja/busca` (PRD-061 RF-011/012).
 *
 * Combines the PRD-030 search helpers with the sidebar filters and sorts.
 * The vehicle filter feeds `searchPartsByApplication`; the free-text query
 * routes through `findByOemCode` when it looks like an OEM code and falls
 * back to `searchPartsByText` otherwise.
 */
export function useSearchResults(filters: ISearchFiltersState): IUseSearchResultsResult {
  const storefrontProvider = useStorefrontProvider();

  const partsQuery = useQuery({
    queryKey: ["storefront-search", "parts"] as const,
    queryFn: () => storefrontProvider.listCatalog(),
    staleTime: STALE_MS,
  });

  const enableTopSelling = filters.sort === "top-selling";
  const topSellingQuery = useQuery({
    queryKey: ["storefront-search", "top-selling"] as const,
    queryFn: () => storefrontProvider.listTopSellingIds(STORE_ID),
    staleTime: STALE_MS,
    enabled: enableTopSelling,
  });

  const result = useMemo<IUseSearchResultsResult>(() => {
    const parts = partsQuery.data ?? [];
    if (parts.length === 0) {
      return {
        isLoading: partsQuery.isLoading,
        isError: partsQuery.isError,
        matchCount: 0,
        totalCount: 0,
        pageItems: [],
        pageCount: 0,
      };
    }

    let base: IPart[] = parts.filter((p) => p.active);

    // Stage 1: free-text search + vehicle filter.
    const hasVehicle =
      filters.vehicle.brand !== null ||
      filters.vehicle.model !== null ||
      filters.vehicle.year !== null;

    if (hasVehicle) {
      base = searchPartsByApplication(base, {
        brand: filters.vehicle.brand ?? undefined,
        model: filters.vehicle.model ?? undefined,
        year: filters.vehicle.year ?? undefined,
      });
    }

    if (filters.q.length > 0) {
      const candidate = findByOemCode(base, filters.q);
      if (candidate) {
        base = [candidate];
      } else {
        base = searchPartsByText(base, filters.q);
      }
    }

    const matchCount = base.length;

    // Stage 2: sidebar filters (additive AND).
    let filtered = base;

    if (filters.brand) {
      const needle = filters.brand.toLowerCase();
      filtered = filtered.filter((p) =>
        p.applications.some((app) => app.vehicleBrand.toLowerCase() === needle),
      );
    }

    if (filters.categories.length > 0) {
      const set = new Set(filters.categories);
      filtered = filtered.filter((p) => (p.category ? set.has(p.category) : false));
    }

    if (filters.manufacturers.length > 0) {
      const set = new Set(filters.manufacturers.map((m) => m.toLowerCase()));
      filtered = filtered.filter((p) => set.has(p.brand.toLowerCase()));
    }

    if (filters.type !== "all") {
      const wantOriginal = filters.type === "original";
      filtered = filtered.filter((p) => Boolean(p.isOriginal) === wantOriginal);
    }

    if (filters.priceMin !== null) {
      filtered = filtered.filter((p) => p.unitPrice >= (filters.priceMin as number));
    }
    if (filters.priceMax !== null) {
      filtered = filtered.filter((p) => p.unitPrice <= (filters.priceMax as number));
    }

    if (filters.onlyInStock) {
      filtered = filtered.filter((p) => p.stockAvailable > 0);
    }

    // Stage 3: sort.
    filtered = sortResults(filtered, filters.sort, topSellingQuery.data ?? []);

    const totalCount = filtered.length;
    const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    const currentPage = Math.min(filters.page, pageCount);
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    return {
      isLoading: partsQuery.isLoading || (enableTopSelling && topSellingQuery.isLoading),
      isError: partsQuery.isError || (enableTopSelling && topSellingQuery.isError),
      matchCount,
      totalCount,
      pageItems,
      pageCount,
    };
  }, [
    partsQuery.data,
    partsQuery.isLoading,
    partsQuery.isError,
    topSellingQuery.data,
    topSellingQuery.isLoading,
    topSellingQuery.isError,
    enableTopSelling,
    filters,
  ]);

  return result;
}

function sortResults(
  parts: IPart[],
  sort: ISearchFiltersState["sort"],
  topSellingIds: ID[],
): IPart[] {
  switch (sort) {
    case "price-asc":
      return [...parts].sort((a, b) => a.unitPrice - b.unitPrice);
    case "price-desc":
      return [...parts].sort((a, b) => b.unitPrice - a.unitPrice);
    case "newest":
      return [...parts].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    case "top-selling": {
      const rank = new Map(topSellingIds.map((id, index) => [id, index] as const));
      return [...parts].sort(
        (a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity),
      );
    }
    case "relevance":
    default:
      return parts;
  }
}

export const SEARCH_PAGE_SIZE = PAGE_SIZE;
