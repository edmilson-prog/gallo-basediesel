import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ID, IOrder } from "@/shared/types";
import { useOrdersProvider } from "@/providers/data/hooks/useOrdersProvider";
import { computeOrderStatus } from "../utils/orderStatus";
import { resolveOrderOriginKind } from "../components/OrderOriginBadge";
import {
  resolveOrderDateBounds,
  type IOrdersListFilters,
  type IOrdersListSort,
  type OrdersPageSize,
} from "../utils/listFilters";

export interface IOrdersListQuery {
  data: IOrder[];
  total: number;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => void;
  invalidate: () => Promise<void>;
}

function applyClientFilters(
  orders: IOrder[],
  filters: IOrdersListFilters,
): IOrder[] {
  return orders.filter((o) => {
    if (filters.totalMin !== undefined && o.total < filters.totalMin) return false;
    if (filters.totalMax !== undefined && o.total > filters.totalMax) return false;
    if (filters.storeIds.length > 0 && !filters.storeIds.includes(o.storeId)) return false;
    if (filters.statuses.length > 0) {
      const agg = computeOrderStatus(o);
      if (!filters.statuses.includes(agg)) return false;
    }
    if (filters.paymentStatuses.length > 0) {
      if (!filters.paymentStatuses.includes(o.paymentStatus)) return false;
    }
    if (filters.fulfillmentStatuses.length > 0) {
      if (!filters.fulfillmentStatuses.includes(o.fulfillmentStatus)) return false;
    }
    if (filters.origins.length > 0) {
      const kind = resolveOrderOriginKind(o);
      if (!filters.origins.includes(kind)) return false;
    }
    if (filters.search?.trim()) {
      const needle = filters.search.trim().toLowerCase();
      const haystack = [o.number ?? o.id, o.nfNumber ?? "", o.trackingCode ?? ""].join(" ").toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

function sortOrders(orders: IOrder[], sort: IOrdersListSort): IOrder[] {
  const dir = sort.orderDir === "asc" ? 1 : -1;
  return [...orders].sort((a, b) => {
    const va = a[sort.orderBy];
    const vb = b[sort.orderBy];
    if (typeof va === "number" && typeof vb === "number") return dir * (va - vb);
    return dir * String(va ?? "").localeCompare(String(vb ?? ""));
  });
}

/**
 * Paginated order list (PRD-032). Most filters are applied client-side because
 * status / origin are derived. The provider only narrows by store/seller/customer
 * and date bounds.
 */
export function useOrdersList(
  filters: IOrdersListFilters,
  sort: IOrdersListSort,
  page: number,
  pageSize: OrdersPageSize,
  options: { sellerIdLock?: ID | null } = {},
): IOrdersListQuery {
  const provider = useOrdersProvider();
  const queryClient = useQueryClient();

  const params = useMemo(() => {
    const bounds = resolveOrderDateBounds(filters);
    return {
      storeId: filters.storeIds.length === 1 ? filters.storeIds[0] : undefined,
      sellerId: options.sellerIdLock ?? undefined,
      customerId: filters.customerId,
      since: bounds.createdAfter,
      until: bounds.createdBefore,
      page: 1,
      pageSize: 1000,
    };
  }, [filters, options.sellerIdLock]);

  const query = useQuery({
    queryKey: ["orders-list", params] as const,
    queryFn: () => provider.list(params),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });

  const result = useMemo(() => {
    const fetched = query.data?.data ?? [];
    let filtered = applyClientFilters(fetched, filters);
    if (options.sellerIdLock && filters.sellerIds.length === 0) {
      filtered = filtered.filter((o) => o.sellerId === options.sellerIdLock);
    } else if (filters.sellerIds.length > 0) {
      const set = new Set(filters.sellerIds);
      filtered = filtered.filter((o) => set.has(o.sellerId));
    }
    const sorted = sortOrders(filtered, sort);
    const start = (page - 1) * pageSize;
    return { paged: sorted.slice(start, start + pageSize), total: sorted.length };
  }, [query.data, filters, sort, page, pageSize, options.sellerIdLock]);

  return {
    data: result.paged,
    total: result.total,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    isError: query.isError,
    refetch: () => void query.refetch(),
    invalidate: () => queryClient.invalidateQueries({ queryKey: ["orders-list"] }),
  };
}

export function useOrder(id: ID | undefined) {
  const provider = useOrdersProvider();
  return useQuery({
    queryKey: ["order", id] as const,
    queryFn: () => provider.get(id as ID),
    enabled: Boolean(id),
    staleTime: 60_000,
  });
}
