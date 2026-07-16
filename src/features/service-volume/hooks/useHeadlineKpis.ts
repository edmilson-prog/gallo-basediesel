import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAtendimentoMetricsProvider } from "@/providers/data";
import { computeTrend, type ITrendInfo } from "@/features/manager-dashboard/utils/kpiMath";
import { previousWindowOfEqualSpan } from "@/shared/utils/dateWindow";
import type { IServiceVolumeState } from "./useServiceVolumeFilters";

export interface IHeadlineKpiValue<T = number> {
  current: T | null;
  previous: T | null;
  trend: ITrendInfo;
}

export interface IHeadlineKpis {
  tmaMinutes: IHeadlineKpiValue<number>;
  tmrMinutes: IHeadlineKpiValue<number>;
  resolutionRatePct: IHeadlineKpiValue<number>;
  backlog: IHeadlineKpiValue<number>;
}

/**
 * The "Indicadores principais" row (TMA/TMR/Taxa de Resolução/Backlog),
 * powered by the `service_volume_headline_kpis` SECURITY DEFINER RPC
 * (PRD-214 follow-up) instead of a client-side drain of the whole store's
 * conversations + messages — the latter paid RLS per row and blew past the
 * 8s statement_timeout on wide windows. Trend badges are computed here from
 * the current/previous values the RPC returns, mirroring the same
 * `computeTrend` used by the legacy `useKpis` (manager-dashboard "Operação").
 */
export function useHeadlineKpis(state: IServiceVolumeState) {
  const provider = useAtendimentoMetricsProvider();
  const storeId = state.store === "all" ? undefined : state.store;
  const { prevFromIso, prevToIso } = previousWindowOfEqualSpan(state.fromIso, state.toIso);

  const query = useQuery({
    queryKey: ["sv", "headlineKpis", storeId ?? "all", state.fromIso, state.toIso],
    queryFn: () =>
      provider.getHeadlineKpis({
        storeId,
        from: state.fromIso,
        to: state.toIso,
        prevFrom: prevFromIso,
        prevTo: prevToIso,
      }),
    retry: false,
    refetchOnWindowFocus: false,
  });

  const kpis = useMemo<IHeadlineKpis | undefined>(() => {
    if (!query.data) return undefined;
    const d = query.data;
    return {
      tmaMinutes: {
        current: d.tmaMinutes.current,
        previous: d.tmaMinutes.previous,
        trend: computeTrend(d.tmaMinutes.current, d.tmaMinutes.previous, true),
      },
      tmrMinutes: {
        current: d.tmrMinutes.current,
        previous: d.tmrMinutes.previous,
        trend: computeTrend(d.tmrMinutes.current, d.tmrMinutes.previous, true),
      },
      resolutionRatePct: {
        current: d.resolutionRatePct.current,
        previous: d.resolutionRatePct.previous,
        trend: computeTrend(d.resolutionRatePct.current, d.resolutionRatePct.previous, false),
      },
      backlog: {
        current: d.backlog,
        previous: null,
        trend: { direction: "flat", changePct: null, isImprovement: false },
      },
    };
  }, [query.data]);

  return {
    kpis,
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}
