import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, IOrder, IPart } from "@/shared/types";
import { useOrdersProvider, usePartsProvider } from "@/providers/data";
import { findByOemCode, searchPartsByApplication, searchPartsByText } from "@/features/catalog";
import type { ISearchFiltersState } from "./useSearchFilters";

const STORE_ID = "00000000-0000-0000-0000-000000000001";
const STALE_MS = 5 * 60 * 1000;
const PAGE_SIZE = 24;
const TOP_SELLING_WINDOW_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
  const partsProvider = usePartsProvider();
  const ordersProvider = useOrdersProvider();

  const partsQuery = useQuery({
    queryKey: ["storefront-search", "parts"] as const,
    queryFn: async () => {
      const r = await partsProvider.list({ storeId: STORE_ID, pageSize: 2000 });
      return r.data;
    },
    staleTime: STALE_MS,
  });

  const enableOrders = filters.sort === "top-selling";
  const ordersQuery = useQuery({
    queryKey: ["storefront-search", "orders"] as const,
    queryFn: async () => {
      const r = await ordersProvider.list({ storeId: STORE_ID, pageSize: 2000 });
      return r.data;
    },
    staleTime: STALE_MS,
    enabled: enableOrders,
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
    filtered = sortResults(filtered, filters.sort, ordersQuery.data ?? []);

    const totalCount = filtered.length;
    const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    const currentPage = Math.min(filters.page, pageCount);
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    return {
      isLoading: partsQuery.isLoading || (enableOrders && ordersQuery.isLoading),
      isError: partsQuery.isError || (enableOrders && ordersQuery.isError),
      matchCount,
      totalCount,
      pageItems,
      pageCount,
    };
  }, [
    partsQuery.data,
    partsQuery.isLoading,
    partsQuery.isError,
    ordersQuery.data,
    ordersQuery.isLoading,
    ordersQuery.isError,
    enableOrders,
    filters,
  ]);

  return result;
}

function sortResults(parts: IPart[], sort: ISearchFiltersState["sort"], orders: IOrder[]): IPart[] {
  switch (sort) {
    case "price-asc":
      return [...parts].sort((a, b) => a.unitPrice - b.unitPrice);
    case "price-desc":
      return [...parts].sort((a, b) => b.unitPrice - a.unitPrice);
    case "newest":
      return [...parts].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    case "top-selling": {
      const sinceIso = new Date(Date.now() - TOP_SELLING_WINDOW_DAYS * MS_PER_DAY).toISOString();
      const sold = new Map<ID, number>();
      for (const o of orders) {
        if (o.paymentStatus !== "pago" && o.paymentStatus !== "parcial") continue;
        const ts = o.paidAt ?? o.updatedAt ?? o.createdAt;
        if (ts < sinceIso) continue;
        for (const item of o.items) {
          sold.set(item.partId, (sold.get(item.partId) ?? 0) + item.quantity);
        }
      }
      return [...parts].sort((a, b) => (sold.get(b.id) ?? 0) - (sold.get(a.id) ?? 0));
    }
    case "relevance":
    default:
      return parts;
  }
}

export const SEARCH_PAGE_SIZE = PAGE_SIZE;
