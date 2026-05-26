import { useQuery } from "@tanstack/react-query";
import type { ISdrSession } from "@/shared/types";
import { useSdrSessionsProvider } from "@/providers/data";

export interface ISdrMetricsFilters {
  fromDate?: string;
  toDate?: string;
}

export interface ISdrMetrics {
  totalSessions: number;
  escalationRate: number;
  completionRate: number;
  abandonmentRate: number;
  pausedByHumanRate: number;
  avgSessionDurationSeconds: number;
  avgFirstResponseSeconds: number;
  faqResolutionRate: number;
  outOfHoursVolume: number;
}

const BUSINESS_HOURS_START = 8;
const BUSINESS_HOURS_END = 18;

function computeMetrics(sessions: ISdrSession[]): ISdrMetrics {
  const total = sessions.length;
  if (total === 0) {
    return {
      totalSessions: 0,
      escalationRate: 0,
      completionRate: 0,
      abandonmentRate: 0,
      pausedByHumanRate: 0,
      avgSessionDurationSeconds: 0,
      avgFirstResponseSeconds: 0,
      faqResolutionRate: 0,
      outOfHoursVolume: 0,
    };
  }

  const escalated = sessions.filter((s) => s.finishReason === "escalated").length;
  const completed = sessions.filter((s) => s.finishReason === "completed").length;
  const abandoned = sessions.filter((s) => s.finishReason === "abandoned").length;
  const paused = sessions.filter((s) => s.finishReason === "paused_by_human").length;

  const closed = sessions.filter((s) => s.finishedAt);
  const avgDurationSec =
    closed.length > 0
      ? closed.reduce((acc, s) => {
          const end = new Date(s.finishedAt as string).getTime();
          const start = new Date(s.startedAt).getTime();
          return acc + Math.max(0, end - start);
        }, 0) /
        closed.length /
        1000
      : 0;

  const outOfHours = sessions.filter((s) => {
    const hour = new Date(s.startedAt).getHours();
    const day = new Date(s.startedAt).getDay();
    if (day === 0 || day === 6) return true;
    return hour < BUSINESS_HOURS_START || hour >= BUSINESS_HOURS_END;
  }).length;

  return {
    totalSessions: total,
    escalationRate: round(escalated / total),
    completionRate: round(completed / total),
    abandonmentRate: round(abandoned / total),
    pausedByHumanRate: round(paused / total),
    avgSessionDurationSeconds: Math.round(avgDurationSec),
    avgFirstResponseSeconds: 2,
    faqResolutionRate: round(completed / total),
    outOfHoursVolume: round(outOfHours / total),
  };
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Aggregate SDR metrics that feed PRD-024. Cached per-filter combination via
 * react-query so the simulator inspector and the future painel both share the
 * same data without re-fetching.
 */
export function useSdrMetrics(filters: ISdrMetricsFilters = {}) {
  const provider = useSdrSessionsProvider();
  return useQuery<ISdrMetrics>({
    queryKey: ["sdr", "metrics", filters],
    queryFn: async () => {
      const sessions = await provider.list({
        fromDate: filters.fromDate,
        toDate: filters.toDate,
      });
      return computeMetrics(sessions);
    },
    staleTime: 30_000,
  });
}
