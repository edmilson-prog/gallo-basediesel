import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID } from "@/shared/types";
import { FETCH_ALL_PAGE_SIZE, useOrdersProvider } from "@/providers/data";
import { buildTurnoverIndex, turnoverWindowStart, type IPartTurnover } from "../utils/turnover";

/** Recompute the window at most once an hour so the queryKey stays stable. */
const WINDOW_BUCKET_MS = 60 * 60 * 1000;

export interface IUseCatalogTurnoverResult {
  /** `null` until the column is on *and* the orders have loaded. */
  index: Map<ID, IPartTurnover> | null;
  isLoading: boolean;
}

/**
 * Per-part turnover for the catalog list's optional "Giro" column.
 *
 * Deliberately opt-in: `IPart` carries no sales history, so the only source is
 * a full 12-month window of orders — an order of magnitude heavier than the
 * list itself. The query stays disabled until the column is switched on, and
 * `index` stays `null` until real data arrives so the cell can tell "unknown"
 * apart from a genuine zero.
 */
export function useCatalogTurnover(enabled: boolean, storeId?: ID): IUseCatalogTurnoverResult {
  const ordersProvider = useOrdersProvider();

  const since = useMemo(() => {
    const bucketed = Math.floor(Date.now() / WINDOW_BUCKET_MS) * WINDOW_BUCKET_MS;
    return turnoverWindowStart(new Date(bucketed));
  }, []);

  const query = useQuery({
    queryKey: ["catalog-turnover", storeId ?? null, since] as const,
    queryFn: () => ordersProvider.list({ storeId, since, pageSize: FETCH_ALL_PAGE_SIZE }),
    enabled,
    staleTime: 5 * 60_000,
  });

  const index = useMemo(() => {
    if (!enabled || !query.data) return null;
    return buildTurnoverIndex(query.data.data, new Date(since).getTime());
  }, [enabled, query.data, since]);

  return { index, isLoading: enabled && query.isLoading };
}
