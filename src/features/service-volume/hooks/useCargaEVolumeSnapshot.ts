import { useQuery } from "@tanstack/react-query";
import { useManagerDashboardProvider, type IManagerDashboardSnapshot } from "@/providers/data";
import { useCurrentStore } from "@/features/multistore";
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

/** Previous window of the same length, immediately preceding `fromIso`. */
function previousWindow(fromIso: string, toIso: string): { prevFromIso: string; prevToIso: string } {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  const span = Math.max(0, to - from);
  return {
    prevFromIso: new Date(from - span - 1).toISOString(),
    prevToIso: new Date(from - 1).toISOString(),
  };
}

/**
 * Feeds "Carga por vendedor", "Heatmap de volume" and the TMA/TMR/Resolução/
 * Backlog KPIs from the service-volume tab's own filters (period + store)
 * instead of the manager-dashboard's "Operação" filters — everything here
 * reacts to whatever range is selected in this tab.
 */
export function useCargaEVolumeSnapshot(state: IServiceVolumeState) {
  const provider = useManagerDashboardProvider();
  const { currentStore } = useCurrentStore();
  const storeId = state.store === "all" ? (currentStore?.id ?? undefined) : state.store;
  const { prevFromIso, prevToIso } = previousWindow(state.fromIso, state.toIso);

  const query = useQuery({
    queryKey: ["sv", "cargaVolume", storeId ?? "all", state.fromIso, state.toIso],
    queryFn: () =>
      provider.snapshot({
        storeId,
        fromIso: state.fromIso,
        toIso: state.toIso,
        prevFromIso,
        prevToIso,
      }),
  });

  return {
    snapshot: query.data ?? EMPTY_SNAPSHOT,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
    storeId,
  };
}
