import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import type {
  ICustomer,
  IGoal,
  IInsight,
  IOrder,
  IPart,
  ISdrSession,
  ISeller,
  ID,
} from "@/shared/types";
import {
  useCustomersProvider,
  useGoalsProvider,
  useOrdersProvider,
  usePartsProvider,
  useSdrSessionsProvider,
  useSellersProvider,
  useSettingsProvider,
} from "@/providers/data";
import { detectInsights } from "../engine";
import { isStillDismissed, useDismissalsStore } from "../store/dismissalsStore";

const STALE_MS = 60 * 60 * 1000; // 1h — the engine recomputes well below the daily cadence required by PRD-053.
const PAGE_SIZE = 1000;

export interface IUseInsightsDailyDetectionResult {
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  /** Active (not dismissed) insights. Sorted by priority then detection time desc. */
  active: IInsight[];
  /** Insights the user has dismissed in this store. */
  dismissed: IInsight[];
  /** Raw set as produced by the engine (no dismissal filtering). */
  all: IInsight[];
}

const PRIORITY_ORDER: Record<IInsight["priority"], number> = {
  critico: 0,
  medio: 1,
  oportunidade: 2,
  info: 3,
};

/**
 * Runs `detectInsights()` over the live mock dataset for the given store.
 *
 * Although the PRD frames this as a "daily detection", on the MVP we run it on
 * every mount with a 1 h stale window — the cost is negligible against the
 * mock dataset and it keeps the UI in sync without a real cron.
 *
 * Dismissals from {@link useDismissalsStore} are honored: an insight whose id
 * matches a still-valid dismissal is filtered out of `active`. Already-known
 * insights snapshot details survive in `dismissed`.
 */
export function useInsightsDailyDetection(
  storeId: ID,
  accessibleStoreIds: ID[],
): IUseInsightsDailyDetectionResult {
  const ordersProvider = useOrdersProvider();
  const customersProvider = useCustomersProvider();
  const partsProvider = usePartsProvider();
  const sellersProvider = useSellersProvider();
  const goalsProvider = useGoalsProvider();
  const sdrProvider = useSdrSessionsProvider();
  const settingsProvider = useSettingsProvider();
  const dismissals = useDismissalsStore((s) => s.byId);

  const ordersQuery = useQuery({
    queryKey: ["insights", "orders", storeId] as const,
    queryFn: async () => {
      const r = await ordersProvider.list({ storeId, pageSize: PAGE_SIZE });
      return r.data as IOrder[];
    },
    staleTime: STALE_MS,
  });

  const customersQuery = useQuery({
    queryKey: ["insights", "customers", storeId] as const,
    queryFn: async () => {
      const r = await customersProvider.list({ storeId, pageSize: PAGE_SIZE });
      return r.data as ICustomer[];
    },
    staleTime: STALE_MS,
  });

  const partsQuery = useQuery({
    queryKey: ["insights", "parts", storeId] as const,
    queryFn: async () => {
      const r = await partsProvider.list({ storeId, pageSize: PAGE_SIZE });
      return r.data as IPart[];
    },
    staleTime: STALE_MS,
  });

  const sellersQuery = useQuery({
    queryKey: ["insights", "sellers"] as const,
    queryFn: async () => {
      const list = await sellersProvider.list({ active: true });
      return list as ISeller[];
    },
    staleTime: STALE_MS,
  });

  const goalsQuery = useQuery({
    queryKey: ["insights", "goals", storeId] as const,
    queryFn: async () => {
      const r = await goalsProvider.list({ storeId, pageSize: PAGE_SIZE });
      return r.data as IGoal[];
    },
    staleTime: STALE_MS,
  });

  const sdrQuery = useQuery({
    queryKey: ["insights", "sdr", storeId] as const,
    queryFn: async () => {
      // `ISdrSessionsProvider.list` returns the array directly (no pagination wrapper).
      const list = await sdrProvider.list({ storeId });
      return list as ISdrSession[];
    },
    staleTime: STALE_MS,
  });

  const settingsQuery = useQuery({
    queryKey: ["insights", "settings", storeId] as const,
    queryFn: () => settingsProvider.get(storeId),
    staleTime: STALE_MS,
  });

  const isLoading =
    ordersQuery.isLoading ||
    customersQuery.isLoading ||
    partsQuery.isLoading ||
    sellersQuery.isLoading ||
    goalsQuery.isLoading ||
    sdrQuery.isLoading ||
    settingsQuery.isLoading;

  const isError =
    ordersQuery.isError ||
    customersQuery.isError ||
    partsQuery.isError ||
    sellersQuery.isError ||
    goalsQuery.isError ||
    sdrQuery.isError ||
    settingsQuery.isError;

  const all = useMemo<IInsight[]>(() => {
    const settings = settingsQuery.data;
    if (!settings || !settings.insightsEnabled) return [];
    const now = new Date();
    return detectInsights({
      now,
      storeId,
      thresholds: settings.insightThresholds,
      orders: ordersQuery.data ?? [],
      customers: customersQuery.data ?? [],
      parts: partsQuery.data ?? [],
      sellers: sellersQuery.data ?? [],
      goals: goalsQuery.data ?? [],
      sdrSessions: sdrQuery.data ?? [],
      dormantDays: settings.lifecycleThresholds.dormantDays,
    });
  }, [
    storeId,
    settingsQuery.data,
    ordersQuery.data,
    customersQuery.data,
    partsQuery.data,
    sellersQuery.data,
    goalsQuery.data,
    sdrQuery.data,
  ]);

  const { active, dismissed } = useMemo(() => {
    const now = new Date();
    const activeList: IInsight[] = [];
    const dismissedSeen = new Set<string>();
    for (const ins of all) {
      if (isStillDismissed(ins.id, ins.validUntil, dismissals, now)) {
        dismissedSeen.add(ins.id);
        continue;
      }
      activeList.push(ins);
    }

    // Build the dismissed list from snapshots (covers historical dismissals
    // even when the underlying pattern no longer surfaces).
    const dismissedList: IInsight[] = [];
    for (const id of Object.keys(dismissals)) {
      const entry = dismissals[id];
      if (
        entry.snapshot.storeId !== storeId &&
        !accessibleStoreIds.includes(entry.snapshot.storeId)
      ) {
        continue;
      }
      const current = all.find((i) => i.id === id);
      if (current) {
        dismissedList.push({
          ...current,
          dismissedBy: entry.dismissedBy,
          dismissedAt: entry.dismissedAt,
          dismissReason: entry.reason,
        });
      } else {
        dismissedList.push({
          id,
          type: entry.snapshot.type as IInsight["type"],
          priority: "info",
          category: "comercial",
          title: entry.snapshot.title,
          description: entry.snapshot.description,
          context: {},
          detectedAt: entry.snapshot.detectedAt,
          dismissedBy: entry.dismissedBy,
          dismissedAt: entry.dismissedAt,
          dismissReason: entry.reason,
          storeId: entry.snapshot.storeId,
        });
      }
      void dismissedSeen;
    }

    activeList.sort((a, b) => {
      const pa = PRIORITY_ORDER[a.priority];
      const pb = PRIORITY_ORDER[b.priority];
      if (pa !== pb) return pa - pb;
      return a.detectedAt < b.detectedAt ? 1 : a.detectedAt > b.detectedAt ? -1 : 0;
    });
    dismissedList.sort((a, b) =>
      (a.dismissedAt ?? "") < (b.dismissedAt ?? "")
        ? 1
        : (a.dismissedAt ?? "") > (b.dismissedAt ?? "")
          ? -1
          : 0,
    );

    return { active: activeList, dismissed: dismissedList };
  }, [all, dismissals, storeId, accessibleStoreIds]);

  return {
    isLoading,
    isError,
    refetch: () => {
      void ordersQuery.refetch();
      void customersQuery.refetch();
      void partsQuery.refetch();
      void sellersQuery.refetch();
      void goalsQuery.refetch();
      void sdrQuery.refetch();
      void settingsQuery.refetch();
    },
    active,
    dismissed,
    all,
  };
}
