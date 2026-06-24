import { useQuery } from "@tanstack/react-query";
import { useAtendimentoMetricsProvider } from "@/providers/data";
import type { MetricAudience } from "@/shared/types";
import type { IServiceVolumeState } from "./useServiceVolumeFilters";

export function useServiceVolumeMetrics(state: IServiceVolumeState, audience: MetricAudience) {
  const provider = useAtendimentoMetricsProvider();
  const storeId = state.store === "all" ? undefined : state.store;
  const baseKey = [storeId ?? "all", state.fromIso, state.toIso, state.granularity] as const;
  const params = { storeId, from: state.fromIso, to: state.toIso, granularity: state.granularity };

  const novos = useQuery({
    queryKey: ["sv", "novos", ...baseKey],
    queryFn: () => provider.getNovosAtendimentos(params),
  });
  const volume = useQuery({
    queryKey: ["sv", "volume", ...baseKey],
    queryFn: () => provider.getMessageVolume(params),
  });
  const byUser = useQuery({
    queryKey: ["sv", "byUser", ...baseKey, audience],
    queryFn: () => provider.getMessagesByUser({ ...params, audience }),
  });
  const status = useQuery({
    queryKey: ["sv", "status", ...baseKey],
    queryFn: () => provider.getStatusDistribution(params),
  });
  const accumulated = useQuery({
    queryKey: ["sv", "accumulated", ...baseKey],
    queryFn: () => provider.getAccumulatedChats(params),
  });
  const handleTime = useQuery({
    queryKey: ["sv", "handleTime", ...baseKey],
    queryFn: () => provider.getHandleTimeStats(params),
  });

  return { novos, volume, byUser, status, accumulated, handleTime };
}
