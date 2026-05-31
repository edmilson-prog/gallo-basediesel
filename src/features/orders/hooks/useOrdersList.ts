import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ICustomer, ID, IOrder, ISeller } from "@/shared/types";
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
  /** Full filtered set BEFORE the aggregate-status filter and pagination — feeds KPIs/tabs. */
  allFiltered: IOrder[];
  total: number;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => void;
  invalidate: () => Promise<void>;
}

function applyClientFilters(orders: IOrder[], filters: IOrdersListFilters): IOrder[] {
  return orders.filter((o) => {
    if (filters.totalMin !== undefined && o.total < filters.totalMin) return false;
    if (filters.totalMax !== undefined && o.total > filters.totalMax) return false;
    if (filters.storeIds.length > 0 && !filters.storeIds.includes(o.storeId)) return false;
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
      const haystack = [o.number ?? o.id, o.nfNumber ?? "", o.trackingCode ?? ""]
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(needle)) return false;
    }
    return true;
  });
}

function orderCustomerName(o: IOrder, customersById?: Map<ID, ICustomer>): string {
  const c = customersById?.get(o.customerId);
  if (!c) return "";
  return c.type === "B2B" ? c.nomeFantasia || c.razaoSocial : c.fullName;
}

function orderSellerName(o: IOrder, sellersById?: Map<ID, ISeller>): string {
  return sellersById?.get(o.sellerId)?.fullName ?? (o.sellerId === "sdr-agent" ? "Agente SDR" : "");
}

function orderNumberLabel(o: IOrder): string {
  return o.number ?? o.id.replace(/^order-/, "PD-");
}

/** Sort orders by any column — resolves customer/seller names and derived status/origin. */
function sortOrders(
  orders: IOrder[],
  sort: IOrdersListSort,
  customersById?: Map<ID, ICustomer>,
  sellersById?: Map<ID, ISeller>,
): IOrder[] {
  const dir = sort.orderDir === "desc" ? -1 : 1;
  const cmpStr = (a: string, b: string) => a.localeCompare(b, "pt-BR") * dir;
  return [...orders].sort((a, b) => {
    switch (sort.orderBy) {
      case "number":
        return cmpStr(orderNumberLabel(a), orderNumberLabel(b));
      case "customer":
        return cmpStr(orderCustomerName(a, customersById), orderCustomerName(b, customersById));
      case "origin":
        return cmpStr(resolveOrderOriginKind(a), resolveOrderOriginKind(b));
      case "seller":
        return cmpStr(orderSellerName(a, sellersById), orderSellerName(b, sellersById));
      case "status":
        return cmpStr(computeOrderStatus(a), computeOrderStatus(b));
      case "total":
        return (a.total - b.total) * dir;
      case "updatedAt":
        return cmpStr(a.updatedAt ?? "", b.updatedAt ?? "");
      case "createdAt":
      default:
        return cmpStr(a.createdAt, b.createdAt);
    }
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
  options: {
    sellerIdLock?: ID | null;
    customersById?: Map<ID, ICustomer>;
    sellersById?: Map<ID, ISeller>;
  } = {},
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
    // allFiltered = filtros comuns + vendedor, MAS sem o status agregado nem paginação.
    let allFiltered = applyClientFilters(fetched, filters);
    if (options.sellerIdLock && filters.sellerIds.length === 0) {
      allFiltered = allFiltered.filter((o) => o.sellerId === options.sellerIdLock);
    } else if (filters.sellerIds.length > 0) {
      const set = new Set(filters.sellerIds);
      allFiltered = allFiltered.filter((o) => set.has(o.sellerId));
    }
    const statusSet = new Set(filters.statuses);
    const afterStatus =
      statusSet.size > 0
        ? allFiltered.filter((o) => statusSet.has(computeOrderStatus(o)))
        : allFiltered;
    const sorted = sortOrders(afterStatus, sort, options.customersById, options.sellersById);
    const start = (page - 1) * pageSize;
    return {
      paged: sorted.slice(start, start + pageSize),
      total: sorted.length,
      allFiltered,
    };
  }, [
    query.data,
    filters,
    sort,
    page,
    pageSize,
    options.sellerIdLock,
    options.customersById,
    options.sellersById,
  ]);

  return {
    data: result.paged,
    allFiltered: result.allFiltered,
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
