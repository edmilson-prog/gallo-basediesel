import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IABCCurveSettings, ID } from "@/shared/types";
import {
  FETCH_ALL_PAGE_SIZE,
  useCustomersProvider,
  useOrdersProvider,
  useSettingsProvider,
} from "@/providers/data";
import { classifyABC, type IABCMetrics } from "../engine/classifyABC";
import { detectMigrations } from "../engine/detectMigrations";
import type { IABCWindow } from "./useABCFilters";

const STALE_MS = 30_000;

const FALLBACK_SETTINGS: IABCCurveSettings = {
  periodMonths: 12,
  classAThreshold: 0.8,
  classBThreshold: 0.95,
};

export interface IUseABCClassificationParams {
  window: IABCWindow;
  previousWindow: IABCWindow;
  scope: {
    storeId?: ID;
    /** When set, the eligible base is restricted to the seller's portfolio. */
    sellerId?: ID;
  };
  /** Override the platform settings (e.g. for the "preview" mode in admin page). */
  settingsOverride?: Partial<IABCCurveSettings>;
  enabled?: boolean;
}

export interface IUseABCClassificationResult {
  isLoading: boolean;
  hasError: boolean;
  refetch: () => void;
  metrics: IABCMetrics | null;
  /** Effective settings applied (after override merge). */
  settings: IABCCurveSettings;
}

/**
 * Aggregator hook for the ABC curve (PRD-045).
 *
 * Loads customers + paid orders in current and previous windows + platform
 * settings (for the thresholds) and delegates the math to the pure
 * `classifyABC` + `detectMigrations` engines. Result is null while loading.
 *
 * Consumed by:
 *  - `ABCCurvePage` (PRD-045 main UI)
 *  - `ABCClassPage` (PRD-045 drill-down)
 *  - `ABCSettingsPage` (PRD-045 admin — uses `settingsOverride` to preview)
 *  - Optional Cockpit (PRD-040) future swap of the inline stub
 */
export function useABCClassification(
  params: IUseABCClassificationParams,
): IUseABCClassificationResult {
  const { window, previousWindow, scope, settingsOverride, enabled = true } = params;

  const ordersProvider = useOrdersProvider();
  const customersProvider = useCustomersProvider();
  const settingsProvider = useSettingsProvider();

  const customersQuery = useQuery({
    queryKey: ["abc", "customers", scope.storeId, scope.sellerId],
    queryFn: () =>
      customersProvider.list({
        storeId: scope.storeId,
        sellerIds: scope.sellerId ? [scope.sellerId] : undefined,
        pageSize: FETCH_ALL_PAGE_SIZE,
      }),
    staleTime: STALE_MS,
    enabled,
  });

  const ordersCurrentQuery = useQuery({
    queryKey: [
      "abc",
      "orders",
      "current",
      scope.storeId,
      scope.sellerId,
      window.fromIso,
      window.toIso,
    ],
    queryFn: () =>
      ordersProvider.list({
        storeId: scope.storeId,
        sellerId: scope.sellerId,
        paymentStatus: "pago",
        since: window.fromIso,
        until: window.toIso,
        pageSize: 5000,
      }),
    staleTime: STALE_MS,
    enabled,
  });

  const ordersPreviousQuery = useQuery({
    queryKey: [
      "abc",
      "orders",
      "previous",
      scope.storeId,
      scope.sellerId,
      previousWindow.fromIso,
      previousWindow.toIso,
    ],
    queryFn: () =>
      ordersProvider.list({
        storeId: scope.storeId,
        sellerId: scope.sellerId,
        paymentStatus: "pago",
        since: previousWindow.fromIso,
        until: previousWindow.toIso,
        pageSize: 5000,
      }),
    staleTime: STALE_MS,
    enabled,
  });

  const settingsQuery = useQuery({
    queryKey: ["abc", "settings", scope.storeId ?? "default"],
    queryFn: () => settingsProvider.get(scope.storeId ?? "00000000-0000-0000-0000-000000000001"),
    staleTime: 5 * 60_000,
    enabled,
  });

  const isLoading =
    customersQuery.isLoading ||
    ordersCurrentQuery.isLoading ||
    ordersPreviousQuery.isLoading ||
    settingsQuery.isLoading;

  const hasError =
    customersQuery.isError ||
    ordersCurrentQuery.isError ||
    ordersPreviousQuery.isError ||
    settingsQuery.isError;

  const refetch = () => {
    void customersQuery.refetch();
    void ordersCurrentQuery.refetch();
    void ordersPreviousQuery.refetch();
    void settingsQuery.refetch();
  };

  const customers = useMemo(() => customersQuery.data?.data ?? [], [customersQuery.data]);
  const ordersCurrent = useMemo(
    () => ordersCurrentQuery.data?.data ?? [],
    [ordersCurrentQuery.data],
  );
  const ordersPrevious = useMemo(
    () => ordersPreviousQuery.data?.data ?? [],
    [ordersPreviousQuery.data],
  );

  const settings = useMemo<IABCCurveSettings>(() => {
    const base = settingsQuery.data?.abcCurveSettings ?? FALLBACK_SETTINGS;
    return { ...base, ...(settingsOverride ?? {}) };
  }, [settingsQuery.data, settingsOverride]);

  const metrics = useMemo<IABCMetrics | null>(() => {
    if (isLoading || hasError) return null;
    const current = classifyABC(window.fromIso, window.toIso, {
      customers,
      ordersInPeriod: ordersCurrent,
      settings,
    });
    const previous = classifyABC(previousWindow.fromIso, previousWindow.toIso, {
      customers,
      ordersInPeriod: ordersPrevious,
      settings,
    });
    const migrations = detectMigrations(current.records, previous.classByCustomerId);
    return {
      ...current,
      recordsWithMigration: migrations.records,
      migrations: migrations.buckets,
    };
  }, [
    isLoading,
    hasError,
    window,
    previousWindow,
    customers,
    ordersCurrent,
    ordersPrevious,
    settings,
  ]);

  return {
    isLoading,
    hasError,
    refetch,
    metrics,
    settings,
  };
}
