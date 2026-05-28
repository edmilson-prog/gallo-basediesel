import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, IOrder, IPart } from "@/shared/types";
import { useOrdersProvider, usePartsProvider } from "@/providers/data";
import type { ICategorySlugMapping } from "../data/slugs";
import type { ICategoryFiltersState } from "./useCategoryFilters";

const STORE_ID = "store-matriz";
const STALE_MS = 5 * 60 * 1000;
const PAGE_SIZE = 24;
const NEWEST_WINDOW_DAYS = 90;
const TOP_SELLING_WINDOW_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface IUseCategoryResultsInput {
  mapping: ICategorySlugMapping;
  filters: ICategoryFiltersState;
  /** Optional curated part ids used by `/loja/categoria/promocoes`. */
  promotionPartIds?: ID[];
}

export interface IUseCategoryResultsResult {
  isLoading: boolean;
  isError: boolean;
  /** Parts considered before applying the secondary filters (post-scope). */
  scopeCount: number;
  /** Final count after applying the secondary filters. */
  totalCount: number;
  /** Slice for the current page. */
  pageItems: IPart[];
  pageCount: number;
  /** Catalog (unfiltered) — exposed so the sidebar can derive option lists. */
  scopeParts: IPart[];
}

/**
 * Engine that powers `/loja/categoria/:slug` (PRD-062).
 *
 * Stage 1 — scope by mapping (regular category, top-selling, newest, promo).
 * Stage 2 — apply the URL-synced secondary filters.
 * Stage 3 — sort + paginate.
 */
export function useCategoryResults(input: IUseCategoryResultsInput): IUseCategoryResultsResult {
  const { mapping, filters, promotionPartIds } = input;
  const partsProvider = usePartsProvider();
  const ordersProvider = useOrdersProvider();

  const partsQuery = useQuery({
    queryKey: ["storefront-category", "parts"] as const,
    queryFn: async () => {
      const r = await partsProvider.list({ storeId: STORE_ID, pageSize: 2000 });
      return r.data;
    },
    staleTime: STALE_MS,
  });

  const needsOrders =
    filters.sort === "top-selling" ||
    (mapping.kind === "special" && mapping.special === "top-selling");

  const ordersQuery = useQuery({
    queryKey: ["storefront-category", "orders"] as const,
    queryFn: async () => {
      const r = await ordersProvider.list({ storeId: STORE_ID, pageSize: 2000 });
      return r.data;
    },
    staleTime: STALE_MS,
    enabled: needsOrders,
  });

  return useMemo<IUseCategoryResultsResult>(() => {
    const parts = partsQuery.data ?? [];
    const orders = ordersQuery.data ?? [];

    if (parts.length === 0) {
      return {
        isLoading: partsQuery.isLoading,
        isError: partsQuery.isError,
        scopeCount: 0,
        totalCount: 0,
        pageItems: [],
        pageCount: 0,
        scopeParts: [],
      };
    }

    // Stage 1 — scope by mapping.
    const active = parts.filter((p) => p.active);
    const scopeParts = scopeByMapping(active, mapping, orders, promotionPartIds);
    const scopeCount = scopeParts.length;

    // Stage 2 — secondary filters (additive AND).
    let filtered = scopeParts;

    if (filters.subcategory) {
      const needle = filters.subcategory.toLowerCase();
      filtered = filtered.filter((p) => (p.subcategory ?? "").toLowerCase() === needle);
    }

    if (filters.brand) {
      const needle = filters.brand.toLowerCase();
      filtered = filtered.filter((p) =>
        p.applications.some((app) => app.vehicleBrand.toLowerCase() === needle),
      );
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

    // Stage 3 — sort + paginate.
    filtered = sortResults(filtered, filters.sort, orders, mapping);

    const totalCount = filtered.length;
    const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    const currentPage = Math.min(filters.page, pageCount);
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    return {
      isLoading: partsQuery.isLoading || (needsOrders && ordersQuery.isLoading),
      isError: partsQuery.isError || (needsOrders && ordersQuery.isError),
      scopeCount,
      totalCount,
      pageItems,
      pageCount,
      scopeParts,
    };
  }, [
    partsQuery.data,
    partsQuery.isLoading,
    partsQuery.isError,
    ordersQuery.data,
    ordersQuery.isLoading,
    ordersQuery.isError,
    needsOrders,
    mapping,
    filters,
    promotionPartIds,
  ]);
}

function scopeByMapping(
  parts: IPart[],
  mapping: ICategorySlugMapping,
  orders: IOrder[],
  promotionPartIds?: ID[],
): IPart[] {
  if (mapping.kind === "category") {
    return parts.filter((p) => p.category === mapping.category);
  }
  switch (mapping.special) {
    case "newest": {
      const sinceIso = new Date(Date.now() - NEWEST_WINDOW_DAYS * MS_PER_DAY).toISOString();
      return parts.filter((p) => p.createdAt >= sinceIso);
    }
    case "top-selling": {
      const sold = buildSoldMap(orders);
      return parts.filter((p) => (sold.get(p.id) ?? 0) > 0);
    }
    case "promotions": {
      const ids = new Set(promotionPartIds ?? []);
      if (ids.size === 0) return [];
      return parts.filter((p) => ids.has(p.id));
    }
    default:
      return parts;
  }
}

function sortResults(
  parts: IPart[],
  sort: ICategoryFiltersState["sort"],
  orders: IOrder[],
  mapping: ICategorySlugMapping,
): IPart[] {
  const effectiveSort =
    mapping.kind === "special" && mapping.special === "top-selling" && sort === "relevance"
      ? "top-selling"
      : mapping.kind === "special" && mapping.special === "newest" && sort === "relevance"
        ? "newest"
        : sort;

  switch (effectiveSort) {
    case "price-asc":
      return [...parts].sort((a, b) => a.unitPrice - b.unitPrice);
    case "price-desc":
      return [...parts].sort((a, b) => b.unitPrice - a.unitPrice);
    case "newest":
      return [...parts].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    case "top-selling": {
      const sold = buildSoldMap(orders);
      return [...parts].sort((a, b) => (sold.get(b.id) ?? 0) - (sold.get(a.id) ?? 0));
    }
    case "relevance":
    default:
      return parts;
  }
}

function buildSoldMap(orders: IOrder[]): Map<ID, number> {
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
  return sold;
}

export const CATEGORY_PAGE_SIZE = PAGE_SIZE;
