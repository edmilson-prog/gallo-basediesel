import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useAtendimentoMetricsProvider } from "@/providers/data";
import { useRealtimeConversations } from "@/features/conversations/hooks/useRealtimeConversations";
import { useDebounce } from "@/shared/hooks/useDebounce";
import { buildHeatmapGrid, type IVolumeHeatmapData } from "../engine/heatmapGrid";
import type { IServiceVolumeState } from "./useServiceVolumeFilters";

export type { IVolumeHeatmapData };

/** Coalesces bursts of realtime events into a single refetch. */
const REALTIME_DEBOUNCE_MS = 1500;

/**
 * "Heatmap de volume" — inbound customer messages per (weekday × hour), via
 * the `service_volume_heatmap` SECURITY DEFINER RPC. Replaces the
 * managerDashboard.snapshot() client-side drain of every scoped message
 * (which paid per-row RLS and timed out on wide windows). Buckets come
 * pre-computed in America/Sao_Paulo — the old client bucketed in the
 * viewer's browser timezone, identical for this team (Brazil, UTC−3).
 */
export function useVolumeHeatmap(state: IServiceVolumeState) {
  const provider = useAtendimentoMetricsProvider();
  const realtime = useRealtimeConversations();
  const debouncedTick = useDebounce(realtime.tick, REALTIME_DEBOUNCE_MS);
  const storeId = state.store === "all" ? undefined : state.store;

  const query = useQuery({
    queryKey: ["sv", "heatmap", storeId ?? "all", state.fromIso, state.toIso, debouncedTick],
    queryFn: () =>
      provider.getVolumeHeatmap({ storeId, from: state.fromIso, to: state.toIso }),
    placeholderData: keepPreviousData,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const data = useMemo(() => buildHeatmapGrid(query.data), [query.data]);

  return {
    data,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
