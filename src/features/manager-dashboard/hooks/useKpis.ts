import { useMemo } from "react";
import type { IManagerDashboardSnapshot } from "@/providers/data";
import {
  calculateBacklog,
  calculateResolutionRate,
  calculateTmaMinutes,
  calculateTmrMinutes,
  computeTrend,
  type ITrendInfo,
} from "../utils/kpiMath";

export interface IKpiValue<T = number> {
  current: T | null;
  previous: T | null;
  trend: ITrendInfo;
}

export interface IDashboardKpis {
  tmaMinutes: IKpiValue<number>;
  tmrMinutes: IKpiValue<number>;
  resolutionRatePct: IKpiValue<number>;
  backlog: IKpiValue<number>;
}

/**
 * Derive the four headline KPIs from a snapshot. Trends compare the current
 * window to the previous window — values default to "flat" when either side
 * is missing data.
 */
export function useKpis(snapshot: IManagerDashboardSnapshot): IDashboardKpis {
  return useMemo(() => {
    const tmaCurrent = calculateTmaMinutes(
      snapshot.conversationsInPeriod,
      snapshot.messagesInPeriod,
    );
    const tmaPrev = calculateTmaMinutes(snapshot.conversationsInPrev, snapshot.messagesInPrev);
    const tmrCurrent = calculateTmrMinutes(snapshot.messagesInPeriod);
    const tmrPrev = calculateTmrMinutes(snapshot.messagesInPrev);
    const rateCurrent = calculateResolutionRate(snapshot.conversationsInPeriod);
    const ratePrev = calculateResolutionRate(snapshot.conversationsInPrev);
    const backlog = calculateBacklog(snapshot.openConversations);

    return {
      tmaMinutes: {
        current: tmaCurrent,
        previous: tmaPrev,
        trend: computeTrend(tmaCurrent, tmaPrev, true),
      },
      tmrMinutes: {
        current: tmrCurrent,
        previous: tmrPrev,
        trend: computeTrend(tmrCurrent, tmrPrev, true),
      },
      resolutionRatePct: {
        current: rateCurrent,
        previous: ratePrev,
        trend: computeTrend(rateCurrent, ratePrev, false),
      },
      backlog: {
        current: backlog,
        previous: null,
        trend: { direction: "flat", changePct: null, isImprovement: false },
      },
    };
  }, [snapshot]);
}
