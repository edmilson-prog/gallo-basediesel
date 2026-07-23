import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { ID, IInventoryMovement, IOrder, IPart, MovementType } from "@/shared/types";
import { FETCH_ALL_PAGE_SIZE, useOrdersProvider, usePartsProvider } from "@/providers/data";
import { deriveInventoryMovements } from "../engine";
import type { MovementPeriod } from "./useInventoryMovementsFilters";

const STALE_MS = 60_000;
const PAGE_SIZE_PROVIDER = FETCH_ALL_PAGE_SIZE;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const PERIOD_TO_DAYS: Record<MovementPeriod, number | null> = {
  "24h": 1,
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
};

export interface IInventoryMovementsFilters {
  storeId: ID | "all";
  type: MovementType | "all";
  productQuery: string;
  period: MovementPeriod;
  sellerId: ID | "all";
}

export interface IUseInventoryMovementsResult {
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  all: IInventoryMovement[];
  filtered: IInventoryMovement[];
  kpis: {
    total: number;
    outflowValue: number;
  };
}

/**
 * Loads paid + returned orders from the accessible store(s), derives
 * `IInventoryMovement` records, then applies the active filters in memory.
 *
 * On MVP the dataset is small (~80 orders × ~3 items = ~240 rows), so the
 * derivation + filtering all happen client-side without pagination on the
 * provider.
 */
export function useInventoryMovements(
  filters: IInventoryMovementsFilters,
  accessibleStoreIds: ID[],
): IUseInventoryMovementsResult {
  const ordersProvider = useOrdersProvider();
  const partsProvider = usePartsProvider();

  const storeScope: ID[] = filters.storeId === "all" ? accessibleStoreIds : [filters.storeId];

  const ordersQuery = useQuery({
    queryKey: ["inventory-movement", "orders", storeScope.join(",")] as const,
    queryFn: async () => {
      // The mock provider does not accept a multi-store filter, so we
      // fan out one request per accessible store and flatten the result.
      const results = await Promise.all(
        storeScope.map((sid) =>
          ordersProvider.list({ storeId: sid, pageSize: PAGE_SIZE_PROVIDER }),
        ),
      );
      const flat: IOrder[] = [];
      for (const r of results) flat.push(...r.data);
      return flat;
    },
    staleTime: STALE_MS,
    enabled: storeScope.length > 0,
  });

  const partsQuery = useQuery({
    queryKey: ["inventory-movement", "parts", storeScope[0] ?? "none"] as const,
    queryFn: async () => {
      // Parts are mostly shared (catalog is per-store but OEM codes are the same);
      // grab from the first accessible store as a reference dictionary.
      if (storeScope.length === 0) return { data: [] as IPart[] };
      const r = await partsProvider.list({
        storeId: storeScope[0],
        pageSize: PAGE_SIZE_PROVIDER,
      });
      return r;
    },
    staleTime: STALE_MS,
    enabled: storeScope.length > 0,
  });

  const all = useMemo<IInventoryMovement[]>(() => {
    if (!ordersQuery.data) return [];
    return deriveInventoryMovements({
      orders: ordersQuery.data,
      parts: partsQuery.data?.data ?? [],
    });
  }, [ordersQuery.data, partsQuery.data]);

  const filtered = useMemo<IInventoryMovement[]>(() => {
    const sinceIso = computeSinceIso(filters.period);
    const q = filters.productQuery.trim().toLowerCase();
    return all.filter((mov) => {
      if (filters.type !== "all" && mov.type !== filters.type) return false;
      if (filters.sellerId !== "all" && mov.performedBy !== filters.sellerId) return false;
      if (filters.storeId !== "all" && mov.storeId !== filters.storeId) return false;
      if (sinceIso !== null && mov.performedAt < sinceIso) return false;
      if (q.length > 0) {
        const partOem = mov.partOemCode?.toLowerCase() ?? "";
        const partName = mov.partName.toLowerCase();
        const orderNumber = mov.orderNumber?.toLowerCase() ?? "";
        if (!partName.includes(q) && !partOem.includes(q) && !orderNumber.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [all, filters]);

  const kpis = useMemo(() => {
    let outflowValue = 0;
    if (ordersQuery.data) {
      // Aggregate the gross value of paid orders in the filtered range.
      const sinceIso = computeSinceIso(filters.period);
      for (const o of ordersQuery.data) {
        if (o.paymentStatus !== "pago" && o.paymentStatus !== "parcial") continue;
        if (filters.storeId !== "all" && o.storeId !== filters.storeId) continue;
        if (filters.sellerId !== "all" && o.sellerId !== filters.sellerId) continue;
        const ts = o.paidAt ?? o.updatedAt ?? o.createdAt;
        if (sinceIso !== null && ts < sinceIso) continue;
        outflowValue += o.total;
      }
    }
    return { total: filtered.length, outflowValue };
  }, [filtered, ordersQuery.data, filters.period, filters.storeId, filters.sellerId]);

  return {
    isLoading: ordersQuery.isLoading || partsQuery.isLoading,
    isError: ordersQuery.isError || partsQuery.isError,
    refetch: () => {
      void ordersQuery.refetch();
      void partsQuery.refetch();
    },
    all,
    filtered,
    kpis,
  };
}

function computeSinceIso(period: MovementPeriod): string | null {
  const days = PERIOD_TO_DAYS[period];
  if (days === null) return null;
  return new Date(Date.now() - days * MS_PER_DAY).toISOString();
}
