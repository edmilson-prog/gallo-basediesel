import { useMemo, useState } from "react";
import type { IPart } from "@/shared/types";
import { useDebounce } from "@/shared/hooks/useDebounce";
import { useCatalogList } from "@/features/catalog/hooks/useCatalogList";
import {
  EMPTY_FILTERS,
  DEFAULT_SORT,
  DEFAULT_PAGE_SIZE,
} from "@/features/catalog/utils/listFilters";

export function usePartLookup() {
  const [query, setQuery] = useState("");
  const [vehicleBrand, setVehicleBrand] = useState<string | null>(null);
  const [inStockOnly, setInStockOnly] = useState(false);
  const debounced = useDebounce(query, 250);

  const filters = useMemo(
    () => ({
      ...EMPTY_FILTERS,
      search: debounced,
      vehicleBrand: vehicleBrand ?? undefined,
    }),
    [debounced, vehicleBrand],
  );

  const list = useCatalogList(filters, DEFAULT_SORT, 1, DEFAULT_PAGE_SIZE);

  // "Em estoque" is applied client-side to avoid coupling to StockBucket literals.
  const visibleParts: IPart[] = useMemo(
    () => (inStockOnly ? list.data.filter((p) => p.stockAvailable > 0) : list.data),
    [list.data, inStockOnly],
  );

  return {
    query,
    setQuery,
    vehicleBrand,
    setVehicleBrand,
    inStockOnly,
    setInStockOnly,
    list,
    visibleParts,
  };
}
