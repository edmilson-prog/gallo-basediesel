import { useQuery } from "@tanstack/react-query";
import type { ISupplier, SupplierCategory } from "@/shared/types";
import { FETCH_ALL_PAGE_SIZE, useSuppliersProvider } from "@/providers/data";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";

export interface ISuppliersListFilters {
  search: string;
  category: SupplierCategory | "all";
}

/** Accent-insensitive fold, mirroring `fold()` in `src/mocks/api/suppliers.ts`. */
function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * The whole active set in one fetch: ~126 rows, and every KPI plus the category
 * chips describe the BASE, not the visible page. Filtering happens client-side.
 */
export function useSuppliersList(filters: ISuppliersListFilters) {
  const provider = useSuppliersProvider();
  const { currentStoreId } = useCurrentStore();

  const query = useQuery({
    // The store id, never the store object — an object key re-fetches forever.
    queryKey: ["suppliers", "list", currentStoreId] as const,
    queryFn: () => provider.list({ pageSize: FETCH_ALL_PAGE_SIZE, status: "active" }),
    staleTime: 60_000,
  });

  const all: ISupplier[] = query.data?.data ?? [];
  const visible = all.filter((s) => {
    if (filters.category !== "all" && s.category !== filters.category) return false;
    if (!filters.search.trim()) return true;
    const needle = fold(filters.search);
    const haystack = fold(`${s.name} ${s.tradeName ?? ""} ${s.document ?? ""}`);
    return haystack.includes(needle);
  });

  return {
    all,
    visible,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
