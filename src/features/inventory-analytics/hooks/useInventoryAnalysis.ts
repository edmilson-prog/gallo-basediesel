import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  ID,
  IInventoryAnalysis,
  IInventoryMetrics,
  InventoryCurve,
  InventoryStatus,
  IOrder,
  IPart,
} from "@/shared/types";
import type { PartCategory } from "@/shared/types/part-identification";
import { useOrdersProvider, usePartsProvider, useSettingsProvider } from "@/providers/data";
import { calculateInventoryAnalysis, calculateInventoryMetrics } from "../engine";

const STALE_MS = 60_000;
const PAGE_SIZE = 1000;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface IInventoryFilters {
  storeId: ID;
  category?: PartCategory | "all";
  brand?: string | "all";
  status?: InventoryStatus | "all";
  curve?: InventoryCurve | "all";
}

export interface IUseInventoryAnalysisResult {
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  analyses: IInventoryAnalysis[];
  /** Filtered subset matching the current filters. */
  filtered: IInventoryAnalysis[];
  metrics: IInventoryMetrics;
  /** Metrics restricted to the filtered subset. */
  filteredMetrics: IInventoryMetrics;
  brands: string[];
  parts: IPart[];
}

/**
 * Loads parts + paid order history + settings, runs the engine and surfaces
 * the result + filtered subset for the page consumers.
 */
export function useInventoryAnalysis(filters: IInventoryFilters): IUseInventoryAnalysisResult {
  const partsProvider = usePartsProvider();
  const ordersProvider = useOrdersProvider();
  const settingsProvider = useSettingsProvider();

  const partsQuery = useQuery({
    queryKey: ["inventory", "parts", filters.storeId],
    queryFn: () => partsProvider.list({ storeId: filters.storeId, pageSize: PAGE_SIZE }),
    staleTime: STALE_MS,
  });

  const settingsQuery = useQuery({
    queryKey: ["inventory", "settings", filters.storeId],
    queryFn: () => settingsProvider.get(filters.storeId),
    staleTime: STALE_MS,
  });

  const windowDays = settingsQuery.data?.inventoryAnalysisSettings.consumptionWindowDays ?? 90;
  const since = useMemo(() => {
    return new Date(Date.now() - windowDays * MS_PER_DAY).toISOString();
  }, [windowDays]);

  const ordersQuery = useQuery({
    queryKey: ["inventory", "orders", filters.storeId, since],
    queryFn: () =>
      ordersProvider.list({
        storeId: filters.storeId,
        since,
        pageSize: PAGE_SIZE,
      }),
    staleTime: STALE_MS,
    enabled: settingsQuery.data != null,
  });

  const analyses = useMemo<IInventoryAnalysis[]>(() => {
    if (!settingsQuery.data) return [];
    const parts: IPart[] = partsQuery.data?.data ?? [];
    const rawOrders: IOrder[] = ordersQuery.data?.data ?? [];
    const paidOrders = rawOrders.filter(
      (o) => o.paymentStatus === "pago" || o.paymentStatus === "parcial",
    );
    return calculateInventoryAnalysis({
      parts,
      paidOrders,
      settings: settingsQuery.data.inventoryAnalysisSettings,
      storeId: filters.storeId,
    });
  }, [partsQuery.data, ordersQuery.data, settingsQuery.data, filters.storeId]);

  const filtered = useMemo(() => {
    return analyses.filter((a) => {
      if (filters.category && filters.category !== "all" && a.category !== filters.category)
        return false;
      if (filters.brand && filters.brand !== "all" && a.brand !== filters.brand) return false;
      if (filters.status && filters.status !== "all" && a.status !== filters.status) return false;
      if (filters.curve && filters.curve !== "all" && a.curve !== filters.curve) return false;
      return true;
    });
  }, [analyses, filters]);

  const metrics = useMemo(() => calculateInventoryMetrics(analyses), [analyses]);
  const filteredMetrics = useMemo(() => calculateInventoryMetrics(filtered), [filtered]);

  const brands = useMemo(() => {
    const set = new Set<string>();
    for (const a of analyses) if (a.brand) set.add(a.brand);
    return Array.from(set).sort();
  }, [analyses]);

  return {
    isLoading: partsQuery.isLoading || ordersQuery.isLoading || settingsQuery.isLoading,
    isError: partsQuery.isError || ordersQuery.isError || settingsQuery.isError,
    refetch: () => {
      void partsQuery.refetch();
      void ordersQuery.refetch();
      void settingsQuery.refetch();
    },
    analyses,
    filtered,
    metrics,
    filteredMetrics,
    brands,
    parts: partsQuery.data?.data ?? [],
  };
}
