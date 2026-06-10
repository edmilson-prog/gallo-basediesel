import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, IPart } from "@/shared/types";
import { useStorefrontProvider } from "@/providers/data";
import type { ICategorySlugMapping } from "../data/slugs";
import type { ICategoryFiltersState } from "./useCategoryFilters";

const STORE_ID = "00000000-0000-0000-0000-000000000001";
const STALE_MS = 5 * 60 * 1000;
const PAGE_SIZE = 24;
const NEWEST_WINDOW_DAYS = 90;
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
  const storefrontProvider = useStorefrontProvider();

  const partsQuery = useQuery({
    queryKey: ["storefront-category", "parts"] as const,
    queryFn: () => storefrontProvider.listCatalog(),
    staleTime: STALE_MS,
  });

  const needsTopSelling =
    filters.sort === "top-selling" ||
    (mapping.kind === "special" && mapping.special === "top-selling");

  const topSellingQuery = useQuery({
    queryKey: ["storefront-category", "top-selling"] as const,
    queryFn: () => storefrontProvider.listTopSellingIds(STORE_ID),
    staleTime: STALE_MS,
    enabled: needsTopSelling,
  });

  return useMemo<IUseCategoryResultsResult>(() => {
    const parts = partsQuery.data ?? [];
    const topSellingIds = topSellingQuery.data ?? [];

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
    const scopeParts = scopeByMapping(active, mapping, topSellingIds, promotionPartIds);
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
    filtered = sortResults(filtered, filters.sort, topSellingIds, mapping);

    const totalCount = filtered.length;
    const pageCount = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    const currentPage = Math.min(filters.page, pageCount);
    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    return {
      isLoading: partsQuery.isLoading || (needsTopSelling && topSellingQuery.isLoading),
      isError: partsQuery.isError || (needsTopSelling && topSellingQuery.isError),
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
    topSellingQuery.data,
    topSellingQuery.isLoading,
    topSellingQuery.isError,
    needsTopSelling,
    mapping,
    filters,
    promotionPartIds,
  ]);
}

function scopeByMapping(
  parts: IPart[],
  mapping: ICategorySlugMapping,
  topSellingIds: ID[],
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
      const topSet = new Set(topSellingIds);
      return parts.filter((p) => topSet.has(p.id));
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
  topSellingIds: ID[],
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

export const CATEGORY_PAGE_SIZE = PAGE_SIZE;
