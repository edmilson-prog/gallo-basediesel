import { useQuery } from "@tanstack/react-query";
import type { ISupplier } from "@/shared/types";
import { FETCH_ALL_PAGE_SIZE, useSuppliersProvider } from "@/providers/data";
import { useCurrentStore } from "@/features/multistore/hooks/useCurrentStore";
import { asKnownCategory } from "../utils/supplierDisplay";

export interface ISuppliersListFilters {
  search: string;
  /** `category` is free text on the converged type — no fixed union. */
  category: string | "all";
}

/** Accent-insensitive fold for the client-side search filter below. */
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
    queryFn: () => provider.list({ pageSize: FETCH_ALL_PAGE_SIZE, active: true }),
    staleTime: 60_000,
  });

  const all: ISupplier[] = query.data?.data ?? [];
  // `list()` requests `count: "exact"` from PostgREST, so `total` is the real
  // row count even past PostgREST's 1.000-row cap on `data` — unlike
  // `all.length`, which silently truncates once the active set crosses that
  // size. KPIs that state a headline count must read `total`, not the array.
  const total = query.data?.total ?? all.length;
  const visible = all.filter((s) => {
    // Normalized the same way `SuppliersTable`/`SuppliersFiltersBar` display
    // and count categories: an XML-imported supplier's `category` is `null`
    // by construction (the Tally migration leaves it blank on purpose), and
    // it must filter into the same "Peças" bucket its row is labeled with —
    // never silently drop out of every category filter.
    if (filters.category !== "all" && asKnownCategory(s.category) !== filters.category) {
      return false;
    }
    if (!filters.search.trim()) return true;
    const needle = fold(filters.search);
    const haystack = fold(`${s.corporateName} ${s.tradeName ?? ""} ${s.cnpj}`);
    return haystack.includes(needle);
  });

  return {
    all,
    visible,
    total,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
