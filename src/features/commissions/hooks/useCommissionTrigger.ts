import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ICommissionEngineContext } from "../engine";
import type { ICommission, ID } from "@/shared/types";
import {
  useCommissionsProvider,
  useGoalsProvider,
  useOrdersProvider,
  useSettingsProvider,
  useTransfersProvider,
} from "@/providers/data";
import { calculateCommission } from "../engine";

export interface IUseCommissionTriggerParams {
  storeId: ID;
  enabled?: boolean;
}

/**
 * Idempotent trigger that ensures every paid order in the store has an
 * `ICommission` record (one or two when split). Runs once per mount per store
 * and again when the orders/commissions queries become stale (covered by the
 * TanStack invalidations the rest of the feature emits).
 *
 * Replaces the lightweight `commissionPreview` from PRD-032 — the OrderDetail
 * page now consumes the real commission via `useCommissionForOrder` when it
 * exists.
 */
export function useCommissionTrigger(params: IUseCommissionTriggerParams): {
  isLoading: boolean;
  isSyncing: boolean;
} {
  const { storeId, enabled = true } = params;
  const ordersProvider = useOrdersProvider();
  const transfersProvider = useTransfersProvider();
  const goalsProvider = useGoalsProvider();
  const settingsProvider = useSettingsProvider();
  const commissionsProvider = useCommissionsProvider();
  const queryClient = useQueryClient();
  const syncingRef = useRef(false);

  const ordersQuery = useQuery({
    queryKey: ["commissions", "trigger", "orders", storeId],
    queryFn: () => ordersProvider.list({ storeId, paymentStatus: "pago", pageSize: 5000 }),
    enabled,
    staleTime: 30_000,
  });

  const commissionsQuery = useQuery({
    queryKey: ["commissions", "trigger", "existing", storeId],
    queryFn: () => commissionsProvider.list({ storeId, pageSize: 5000 }),
    enabled,
    staleTime: 30_000,
  });

  const settingsQuery = useQuery({
    queryKey: ["commissions", "trigger", "settings", storeId],
    queryFn: () => settingsProvider.get(storeId),
    enabled,
    staleTime: 60_000,
  });

  const transfersQuery = useQuery({
    queryKey: ["commissions", "trigger", "transfers", storeId],
    queryFn: () => transfersProvider.list({ storeId, pageSize: 1000 }),
    enabled,
    staleTime: 60_000,
  });

  const goalsQuery = useQuery({
    queryKey: ["commissions", "trigger", "goals", storeId],
    queryFn: () => goalsProvider.list({ storeId, pageSize: 1000 }),
    enabled,
    staleTime: 60_000,
  });

  const isLoading =
    ordersQuery.isLoading ||
    commissionsQuery.isLoading ||
    settingsQuery.isLoading ||
    transfersQuery.isLoading ||
    goalsQuery.isLoading;

  useEffect(() => {
    if (!enabled || isLoading || syncingRef.current) return;
    const orders = ordersQuery.data?.data ?? [];
    const existing = commissionsQuery.data?.data ?? [];
    const settings = settingsQuery.data;
    if (!settings || !settings.commissionSettings.active) return;

    const coveredOrderIds = new Set<ID>(existing.map((c) => c.orderId));
    const missing = orders.filter((o) => !coveredOrderIds.has(o.id));
    if (missing.length === 0) return;

    syncingRef.current = true;
    const ctx: ICommissionEngineContext = {
      settings: settings.commissionSettings,
      transfers: transfersQuery.data?.data ?? [],
      goals: goalsQuery.data?.data ?? [],
    };
    void (async () => {
      try {
        for (const order of missing) {
          const calc = calculateCommission(order, ctx);
          const records: ICommission[] = [];
          const created = await commissionsProvider.create(calc.primary);
          records.push(created);
          if (calc.secondary) {
            const sec = await commissionsProvider.create(calc.secondary);
            records.push(sec);
          }
          if (records.length > 0 && import.meta.env.DEV) {
            console.debug(
              `[commissions] auto-emitted ${records.length} record(s) for order ${order.id}`,
            );
          }
        }
        void queryClient.invalidateQueries({ queryKey: ["commissions"] });
      } finally {
        syncingRef.current = false;
      }
    })();
  }, [
    enabled,
    isLoading,
    ordersQuery.data,
    commissionsQuery.data,
    settingsQuery.data,
    transfersQuery.data,
    goalsQuery.data,
    commissionsProvider,
    queryClient,
  ]);

  return {
    isLoading,
    isSyncing: syncingRef.current,
  };
}
