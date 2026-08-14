import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ID, IPart } from "@/shared/types";
import { FETCH_ALL_PAGE_SIZE } from "@/providers/data";
import { usePartsProvider } from "@/providers/data/hooks/usePartsProvider";
import {
  DEFAULT_SORT,
  toListParams,
  type CatalogPageSize,
  type ICatalogListFilters,
  type ICatalogListSort,
} from "../utils/listFilters";
import { getCategoryLabel } from "../utils/categories";
import { matchesCoverage, missingFields, needsRestock } from "../utils/completeness";
import { marginOnPrice } from "../utils/pricing";
import { turnoverFor, type IPartTurnover } from "../utils/turnover";

/** Apply post-provider filters that the parts provider cannot express natively. */
function applyClientSideFilters(parts: IPart[], filters: ICatalogListFilters): IPart[] {
  const brand = filters.vehicleBrand?.toLowerCase();
  const model = filters.vehicleModel?.toLowerCase();
  return parts.filter((part) => {
    if (!matchesCoverage(part, filters.coverage)) return false;
    if (
      filters.categories.length > 0 &&
      (!part.category || !filters.categories.includes(part.category))
    ) {
      return false;
    }
    if (filters.subcategory && part.subcategory !== filters.subcategory) return false;
    if (filters.manufacturers.length > 0 && !filters.manufacturers.includes(part.brand))
      return false;
    if (filters.origin === "original" && !part.isOriginal) return false;
    if (filters.origin === "equivalent" && part.isOriginal) return false;
    if (filters.priceMin !== undefined && part.unitPrice < filters.priceMin) return false;
    if (filters.priceMax !== undefined && part.unitPrice > filters.priceMax) return false;
    if (
      filters.stock === "low" &&
      (part.stockAvailable === 0 || part.stockAvailable > part.stockMinimum)
    ) {
      return false;
    }
    if (filters.stock === "zero" && part.stockAvailable !== 0) return false;
    if (filters.stock === "restock" && !needsRestock(part)) return false;
    if (
      filters.storeIds.length > 0 &&
      (!part.storeId || !filters.storeIds.includes(part.storeId))
    ) {
      return false;
    }
    if (brand || model || filters.vehicleYear !== undefined) {
      const hasMatchingApp = part.applications.some((app) => {
        if (brand && app.vehicleBrand.toLowerCase() !== brand) return false;
        if (model && app.vehicleModel.toLowerCase() !== model) return false;
        if (filters.vehicleYear !== undefined) {
          if (filters.vehicleYear < app.yearStart || filters.vehicleYear > app.yearEnd)
            return false;
        }
        return true;
      });
      if (!hasMatchingApp) return false;
    }
    return true;
  });
}

function applicationSortKey(part: IPart): string {
  const first = part.applications[0];
  return first ? `${first.vehicleBrand} ${first.vehicleModel}` : "";
}

/** Margin sort key — parts with no cost sort below every real margin. */
function marginSortKey(part: IPart): number {
  return part.unitCost > 0 ? marginOnPrice(part.unitPrice, part.unitCost) : -1;
}

/** Sort parts by any catalog column — covers fields the provider cannot sort natively. */
function sortParts(
  parts: IPart[],
  sort: ICatalogListSort,
  turnoverIndex: Map<ID, IPartTurnover> | null,
): IPart[] {
  const dir = sort.orderDir === "desc" ? -1 : 1;
  const compareStr = (a: string, b: string) => a.localeCompare(b, "pt-BR") * dir;
  return [...parts].sort((a, b) => {
    switch (sort.orderBy) {
      case "oem":
        return compareStr(a.oemCodes[0] ?? "", b.oemCodes[0] ?? "");
      case "category":
        return compareStr(getCategoryLabel(a.category), getCategoryLabel(b.category));
      case "ficha":
        // Most incomplete first when descending — the enrichment queue order.
        return (missingFields(a).length - missingFields(b).length) * dir;
      case "manufacturer":
        return compareStr(a.brand, b.brand);
      case "applications":
        return compareStr(applicationSortKey(a), applicationSortKey(b));
      case "unitPrice":
        return (a.unitPrice - b.unitPrice) * dir;
      case "margin":
        return (marginSortKey(a) - marginSortKey(b)) * dir;
      case "turnover":
        return (
          ((turnoverFor(turnoverIndex, a.id)?.units ?? 0) -
            (turnoverFor(turnoverIndex, b.id)?.units ?? 0)) *
          dir
        );
      case "stockAvailable":
        return (a.stockAvailable - b.stockAvailable) * dir;
      case "status":
        return (Number(a.active) - Number(b.active)) * dir;
      case "name":
      default:
        return compareStr(a.name, b.name);
    }
  });
}

export interface ICatalogListQuery {
  data: IPart[];
  /** The filtered result set across every page — drives grouping and select-all. */
  all: IPart[];
  total: number;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => void;
  invalidate: () => Promise<void>;
}

/**
 * Paginated catalog list with client-side post-filtering for criteria not
 * supported by the provider (categories, applications, origin, price range,
 * stock buckets, multi-store).
 */
export function useCatalogList(
  filters: ICatalogListFilters,
  sort: ICatalogListSort,
  page: number,
  pageSize: CatalogPageSize,
  /** Present only while the (opt-in) turnover column is on; enables its sort. */
  turnoverIndex: Map<ID, IPartTurnover> | null = null,
): ICatalogListQuery {
  const provider = usePartsProvider();
  const queryClient = useQueryClient();

  // The window intentionally covers the whole catalog — filtering, sorting and
  // pagination all happen client-side below. orderBy/orderDir are deliberately
  // stripped (not sent to the provider): sortParts() re-sorts every column
  // locally — its default matches the provider's name-asc order — so keeping
  // sort out of the params keeps the queryKey stable across sort toggles
  // instead of refetching the same full window in a different server order.
  const params = useMemo(() => {
    const base = toListParams(filters, DEFAULT_SORT, page, pageSize);
    delete base.orderBy;
    delete base.orderDir;
    return { ...base, page: 1, pageSize: FETCH_ALL_PAGE_SIZE };
  }, [filters, page, pageSize]);

  const query = useQuery({
    queryKey: ["catalog-list", params] as const,
    queryFn: () => provider.list(params),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const result = useMemo(() => {
    const fetched = query.data?.data ?? [];
    const filtered = applyClientSideFilters(fetched, filters);
    const sorted = sortParts(filtered, sort, turnoverIndex);
    const start = (page - 1) * pageSize;
    return {
      paged: sorted.slice(start, start + pageSize),
      all: sorted,
      total: sorted.length,
    };
  }, [query.data, filters, sort, page, pageSize, turnoverIndex]);

  return {
    data: result.paged,
    all: result.all,
    total: result.total,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    refetch: () => void query.refetch(),
    invalidate: () => queryClient.invalidateQueries({ queryKey: ["catalog-list"] }),
  };
}

/** Look up a single part — used by the detail/edit pages. */
export function usePart(id: ID | undefined) {
  const provider = usePartsProvider();
  return useQuery({
    queryKey: ["part", id] as const,
    queryFn: () => provider.get(id as ID),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}
