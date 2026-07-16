import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useAtendimentoMetricsProvider, useSellersProvider } from "@/providers/data";
import { useRealtimeConversations } from "@/features/conversations/hooks/useRealtimeConversations";
import { useDebounce } from "@/shared/hooks/useDebounce";
import {
  buildSellerLoadEntries,
  type ISellerLoadEntry,
  type ISellerLoadOptions,
} from "../engine/sellerLoad";
import type { IServiceVolumeState } from "./useServiceVolumeFilters";

export type { ISellerLoadEntry, ISellerLoadOptions };

/** Coalesces bursts of realtime events into a single refetch. */
const REALTIME_DEBOUNCE_MS = 1500;

/**
 * "Carga por vendedor" — current-state open-conversation load per seller,
 * via the `service_volume_seller_load` SECURITY DEFINER RPC + the store
 * roster from the sellers provider. Replaces the managerDashboard.snapshot()
 * client-side drain (which paid per-row RLS over the whole scoped message set
 * and timed out on wide windows). Refetches on debounced Realtime ticks so
 * the load stays live, same as the old snapshot-based version.
 */
export function useSellerLoad(state: IServiceVolumeState, options: ISellerLoadOptions) {
  const provider = useAtendimentoMetricsProvider();
  const sellersProvider = useSellersProvider();
  const realtime = useRealtimeConversations();
  const debouncedTick = useDebounce(realtime.tick, REALTIME_DEBOUNCE_MS);
  const storeId = state.store === "all" ? undefined : state.store;

  const loadQuery = useQuery({
    queryKey: ["sv", "sellerLoad", storeId ?? "all", debouncedTick],
    queryFn: () => provider.getSellerLoad({ storeId }),
    placeholderData: keepPreviousData,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const rosterQuery = useQuery({
    queryKey: ["sv", "sellerRoster", storeId ?? "all"],
    queryFn: () => sellersProvider.list(storeId ? { storeId } : undefined),
    staleTime: 5 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const entries = useMemo(
    () => buildSellerLoadEntries(loadQuery.data?.rows ?? [], rosterQuery.data ?? [], options),
    [loadQuery.data, rosterQuery.data, options],
  );

  return {
    entries,
    isLoading: loadQuery.isLoading || rosterQuery.isLoading,
    error: loadQuery.error ?? rosterQuery.error,
    refetch: () => {
      void loadQuery.refetch();
      void rosterQuery.refetch();
    },
  };
}
