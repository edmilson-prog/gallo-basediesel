import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ID, IPart } from "@/shared/types";
import { usePartsProvider } from "@/providers/data/hooks/usePartsProvider";
import {
  toListParams,
  type CatalogPageSize,
  type ICatalogListFilters,
  type ICatalogListSort,
} from "../utils/listFilters";

/** Apply post-provider filters that the parts provider cannot express natively. */
function applyClientSideFilters(parts: IPart[], filters: ICatalogListFilters): IPart[] {
  const brand = filters.vehicleBrand?.toLowerCase();
  const model = filters.vehicleModel?.toLowerCase();
  return parts.filter((part) => {
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

export interface ICatalogListQuery {
  data: IPart[];
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
): ICatalogListQuery {
  const provider = usePartsProvider();
  const queryClient = useQueryClient();

  // Always fetch a large window from the provider (mock has only ~200 parts).
  const params = useMemo(
    () => ({ ...toListParams(filters, sort, page, pageSize), page: 1, pageSize: 1000 }),
    [filters, sort, page, pageSize],
  );

  const query = useQuery({
    queryKey: ["catalog-list", params] as const,
    queryFn: () => provider.list(params),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const result = useMemo(() => {
    const fetched = query.data?.data ?? [];
    const filtered = applyClientSideFilters(fetched, filters);
    const start = (page - 1) * pageSize;
    return {
      paged: filtered.slice(start, start + pageSize),
      total: filtered.length,
    };
  }, [query.data, filters, page, pageSize]);

  return {
    data: result.paged,
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
