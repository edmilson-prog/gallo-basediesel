import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useManagerDashboardProvider, type IManagerDashboardSnapshot } from "@/providers/data";
import { useRealtimeConversations } from "@/features/conversations/hooks/useRealtimeConversations";
import { useDebounce } from "@/shared/hooks/useDebounce";
import { previousWindowOfEqualSpan } from "@/shared/utils/dateWindow";
import type { IServiceVolumeState } from "./useServiceVolumeFilters";

const EMPTY_SNAPSHOT: IManagerDashboardSnapshot = {
  openConversations: [],
  sellers: [],
  customers: [],
  conversationsInPeriod: [],
  messagesInPeriod: [],
  conversationsInPrev: [],
  messagesInPrev: [],
};

/** Coalesces bursts of realtime events into a single refetch (mirrors useDashboardSnapshot's debounce). */
const REALTIME_DEBOUNCE_MS = 1500;

/**
 * Feeds "Carga por vendedor", "Heatmap de volume" and the TMA/TMR/Resolução/
 * Backlog KPIs from the service-volume tab's own filters (period + store)
 * instead of the manager-dashboard's "Operação" filters — everything here
 * reacts to whatever range is selected in this tab, plus live Realtime ticks.
 *
 * `state.store` already carries the Gestor store-lock (resolved upstream in
 * `useServiceVolumeFilters`); "all" only ever reaches an Owner, so it maps to
 * `undefined` (cross-store) — same resolution as the sibling
 * `useServiceVolumeMetrics`, so every card on this tab shares one scope.
 */
export function useCargaEVolumeSnapshot(state: IServiceVolumeState) {
  const provider = useManagerDashboardProvider();
  const realtime = useRealtimeConversations();
  const debouncedTick = useDebounce(realtime.tick, REALTIME_DEBOUNCE_MS);
  const storeId = state.store === "all" ? undefined : state.store;
  const { prevFromIso, prevToIso } = previousWindowOfEqualSpan(state.fromIso, state.toIso);

  const query = useQuery({
    queryKey: ["sv", "cargaVolume", storeId ?? "all", state.fromIso, state.toIso, debouncedTick],
    queryFn: () =>
      provider.snapshot({
        storeId,
        fromIso: state.fromIso,
        toIso: state.toIso,
        prevFromIso,
        prevToIso,
      }),
    placeholderData: keepPreviousData,
    retry: false,
    refetchOnWindowFocus: false,
  });

  return {
    snapshot: query.data ?? EMPTY_SNAPSHOT,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    storeId,
  };
}
