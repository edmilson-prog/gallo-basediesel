import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ICustomer, ID, IOrder, IPart, ISeller } from "@/shared/types";
import type { PartCategory } from "@/shared/types/part-identification";
import {
  useCustomersProvider,
  useOrdersProvider,
  usePartsProvider,
  useSellersProvider,
} from "@/providers/data";
import {
  calculateCoverage,
  profitabilityByCategory,
  profitabilityByCustomer,
  profitabilityByProduct,
  profitabilityBySeller,
  profitabilitySummary,
  type ICategoryProfitabilityRow,
  type ICustomerProfitabilityRow,
  type IProductProfitabilityRow,
  type IProfitabilityCoverage,
  type IProfitabilityEngineContext,
  type IProfitabilitySummary,
  type ISellerProfitabilityRow,
} from "../engine";

export interface IProfitabilityFilters {
  storeId: ID;
  monthKey: string;
  sellerId?: ID | "all";
  category?: PartCategory | "all";
  brand?: string | "all";
}

export interface IUseProfitabilityDataResult {
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;

  filtersResolved: IProfitabilityFilters;
  periodBounds: { startIso: string; endIso: string };

  /** All paid orders inside the period, after applying scope filters. */
  paidOrders: IOrder[];

  partsById: Map<ID, IPart>;
  customersById: Map<ID, ICustomer>;
  sellersById: Map<ID, ISeller>;

  /** Available brands across the loaded parts (used by the filter dropdown). */
  brands: string[];
  /** Sellers available in the current store. */
  sellers: ISeller[];

  summary: IProfitabilitySummary;
  coverage: IProfitabilityCoverage;
  productRows: IProductProfitabilityRow[];
  categoryRows: ICategoryProfitabilityRow[];
  customerRows: ICustomerProfitabilityRow[];
  sellerRows: ISellerProfitabilityRow[];

  /** Same shape as `categoryRows` but with the previous month figures. */
  categoryRowsPrevious: ICategoryProfitabilityRow[];
}

const STALE_MS = 60_000;
const PAGE_SIZE = 1000;

function monthBounds(monthKey: string): { startIso: string; endIso: string } {
  const [year, month] = monthKey.split("-").map(Number);
  if (!year || !month) {
    const now = new Date();
    return monthBounds(`${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  const start = new Date(Date.UTC(year, month - 1, 1));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function previousMonth(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const prev = new Date(Date.UTC(y, m - 2, 1));
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * Loads orders + parts + customers + sellers and runs the profitability engine
 * for every dimension in one pass. The reducers are pure (memoized) so the
 * page can render the four tabs without extra computation.
 */
export function useProfitabilityData(filters: IProfitabilityFilters): IUseProfitabilityDataResult {
  const ordersProvider = useOrdersProvider();
  const partsProvider = usePartsProvider();
  const customersProvider = useCustomersProvider();
  const sellersProvider = useSellersProvider();

  const periodBounds = useMemo(() => monthBounds(filters.monthKey), [filters.monthKey]);
  const prevBounds = useMemo(
    () => monthBounds(previousMonth(filters.monthKey)),
    [filters.monthKey],
  );

  const ordersQuery = useQuery({
    queryKey: [
      "profitability",
      "orders",
      filters.storeId,
      periodBounds.startIso,
      periodBounds.endIso,
    ],
    queryFn: () =>
      ordersProvider.list({
        storeId: filters.storeId,
        since: periodBounds.startIso,
        until: periodBounds.endIso,
        pageSize: PAGE_SIZE,
      }),
    staleTime: STALE_MS,
  });

  const ordersPrevQuery = useQuery({
    queryKey: ["profitability", "orders", filters.storeId, prevBounds.startIso, prevBounds.endIso],
    queryFn: () =>
      ordersProvider.list({
        storeId: filters.storeId,
        since: prevBounds.startIso,
        until: prevBounds.endIso,
        pageSize: PAGE_SIZE,
      }),
    staleTime: STALE_MS,
  });

  const partsQuery = useQuery({
    queryKey: ["profitability", "parts", filters.storeId],
    queryFn: () => partsProvider.list({ storeId: filters.storeId, pageSize: PAGE_SIZE }),
    staleTime: STALE_MS,
  });

  const customersQuery = useQuery({
    queryKey: ["profitability", "customers", filters.storeId],
    queryFn: () => customersProvider.list({ storeId: filters.storeId, pageSize: PAGE_SIZE }),
    staleTime: STALE_MS,
  });

  const sellersQuery = useQuery({
    queryKey: ["profitability", "sellers", filters.storeId],
    queryFn: () => sellersProvider.list({ storeId: filters.storeId, active: true }),
    staleTime: STALE_MS,
  });

  const partsList = useMemo<IPart[]>(() => partsQuery.data?.data ?? [], [partsQuery.data]);
  const customersList = useMemo<ICustomer[]>(
    () => customersQuery.data?.data ?? [],
    [customersQuery.data],
  );
  const sellersList = useMemo<ISeller[]>(() => sellersQuery.data ?? [], [sellersQuery.data]);

  const partsById = useMemo(() => {
    const map = new Map<ID, IPart>();
    for (const p of partsList) map.set(p.id, p);
    return map;
  }, [partsList]);

  const customersById = useMemo(() => {
    const map = new Map<ID, ICustomer>();
    for (const c of customersList) map.set(c.id, c);
    return map;
  }, [customersList]);

  const sellersById = useMemo(() => {
    const map = new Map<ID, ISeller>();
    for (const s of sellersList) map.set(s.id, s);
    return map;
  }, [sellersList]);

  const brands = useMemo(() => {
    const set = new Set<string>();
    for (const p of partsList) if (p.brand) set.add(p.brand);
    return Array.from(set).sort();
  }, [partsList]);

  // Apply paid + scope filters, then run the engine per dimension.
  const { paidOrders, paidOrdersPrev } = useMemo(() => {
    const rawCurrent = ordersQuery.data?.data ?? [];
    const rawPrev = ordersPrevQuery.data?.data ?? [];
    const accept = (order: IOrder): boolean => {
      if (order.paymentStatus !== "pago" && order.paymentStatus !== "parcial") return false;
      if (filters.sellerId && filters.sellerId !== "all" && order.sellerId !== filters.sellerId)
        return false;
      if (filters.category && filters.category !== "all") {
        const any = order.items.some((it) => {
          const part = partsById.get(it.partId);
          return part?.category === filters.category;
        });
        if (!any) return false;
      }
      if (filters.brand && filters.brand !== "all") {
        const any = order.items.some((it) => {
          const part = partsById.get(it.partId);
          return part?.brand === filters.brand;
        });
        if (!any) return false;
      }
      return true;
    };
    return {
      paidOrders: rawCurrent.filter(accept),
      paidOrdersPrev: rawPrev.filter(accept),
    };
  }, [ordersQuery.data, ordersPrevQuery.data, filters, partsById]);

  const engineCtx = useMemo<IProfitabilityEngineContext>(
    () => ({ paidOrders, partsById, customersById, sellersById }),
    [paidOrders, partsById, customersById, sellersById],
  );

  const summary = useMemo(() => profitabilitySummary(engineCtx), [engineCtx]);
  const coverage = useMemo(() => calculateCoverage(paidOrders), [paidOrders]);
  const productRows = useMemo(() => profitabilityByProduct(engineCtx), [engineCtx]);
  const categoryRows = useMemo(() => profitabilityByCategory(engineCtx), [engineCtx]);
  const customerRows = useMemo(() => profitabilityByCustomer(engineCtx), [engineCtx]);
  const sellerRows = useMemo(() => profitabilityBySeller(engineCtx), [engineCtx]);

  const categoryRowsPrevious = useMemo(
    () =>
      profitabilityByCategory({
        paidOrders: paidOrdersPrev,
        partsById,
        customersById,
        sellersById,
      }),
    [paidOrdersPrev, partsById, customersById, sellersById],
  );

  const isLoading =
    ordersQuery.isLoading ||
    partsQuery.isLoading ||
    customersQuery.isLoading ||
    sellersQuery.isLoading;
  const isError =
    ordersQuery.isError || partsQuery.isError || customersQuery.isError || sellersQuery.isError;

  return {
    isLoading,
    isError,
    refetch: () => {
      void ordersQuery.refetch();
      void ordersPrevQuery.refetch();
      void partsQuery.refetch();
      void customersQuery.refetch();
      void sellersQuery.refetch();
    },
    filtersResolved: filters,
    periodBounds,
    paidOrders,
    partsById,
    customersById,
    sellersById,
    brands,
    sellers: sellersList,
    summary,
    coverage,
    productRows,
    categoryRows,
    customerRows,
    sellerRows,
    categoryRowsPrevious,
  };
}
