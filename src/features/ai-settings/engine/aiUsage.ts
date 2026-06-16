import type {
  AiFeatureKey,
  AiProviderId,
  AiUsagePeriod,
  IAiBudget,
  IAiUsageEvent,
  IAiUsageSummary,
} from "@/shared/types";

function periodStart(period: AiUsagePeriod, now: Date): Date {
  const d = new Date(now);
  if (period === "last_7d") {
    d.setUTCDate(d.getUTCDate() - 7);
  } else if (period === "last_30d") {
    d.setUTCDate(d.getUTCDate() - 30);
  } else {
    d.setUTCDate(1);
    d.setUTCHours(0, 0, 0, 0);
  }
  return d;
}

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

export function summarizeUsage(
  events: IAiUsageEvent[],
  period: AiUsagePeriod,
  budget: IAiBudget,
  now: Date,
): IAiUsageSummary {
  const start = periodStart(period, now);
  const inPeriod = events.filter((e) => new Date(e.ts) >= start && new Date(e.ts) <= now);

  const calls = inPeriod.length;
  const tokens = inPeriod.reduce((a, e) => a + e.inputTokens + e.outputTokens, 0);
  const costBRL = inPeriod.reduce((a, e) => a + e.costBRL, 0);
  const errors = inPeriod.filter((e) => e.status === "error").length;
  const fallbacks = inPeriod.filter((e) => e.status === "fallback").length;
  const latencySum = inPeriod.reduce((a, e) => a + e.latencyMs, 0);

  const byProviderMap = new Map<AiProviderId, { calls: number; tokens: number; costBRL: number }>();
  for (const e of inPeriod) {
    const cur = byProviderMap.get(e.providerId) ?? { calls: 0, tokens: 0, costBRL: 0 };
    cur.calls += 1;
    cur.tokens += e.inputTokens + e.outputTokens;
    cur.costBRL += e.costBRL;
    byProviderMap.set(e.providerId, cur);
  }

  // growth vs período anterior de mesmo tamanho
  const spanMs = now.getTime() - start.getTime();
  const prevStart = new Date(start.getTime() - spanMs);
  const prev = events.filter((e) => new Date(e.ts) >= prevStart && new Date(e.ts) < start);
  const prevCostByFeature = new Map<AiFeatureKey, number>();
  for (const e of prev) {
    prevCostByFeature.set(e.feature, (prevCostByFeature.get(e.feature) ?? 0) + e.costBRL);
  }

  const byFeatureMap = new Map<AiFeatureKey, { calls: number; costBRL: number }>();
  for (const e of inPeriod) {
    const cur = byFeatureMap.get(e.feature) ?? { calls: 0, costBRL: 0 };
    cur.calls += 1;
    cur.costBRL += e.costBRL;
    byFeatureMap.set(e.feature, cur);
  }

  const seriesMap = new Map<string, { calls: number; tokens: number; costBRL: number }>();
  for (const e of inPeriod) {
    const k = dayKey(e.ts);
    const cur = seriesMap.get(k) ?? { calls: 0, tokens: 0, costBRL: 0 };
    cur.calls += 1;
    cur.tokens += e.inputTokens + e.outputTokens;
    cur.costBRL += e.costBRL;
    seriesMap.set(k, cur);
  }

  return {
    period,
    calls,
    tokens,
    costBRL,
    budgetPct: budget.monthlyCapBRL > 0 ? (costBRL / budget.monthlyCapBRL) * 100 : 0,
    projectionBRL: costBRL, // refined by aiBudget.projectMonthlySpend for "current_month"
    avgTokensPerCall: calls > 0 ? Math.round(tokens / calls) : 0,
    avgLatencyMs: calls > 0 ? Math.round(latencySum / calls) : 0,
    errorRate: calls > 0 ? errors / calls : 0,
    fallbackRate: calls > 0 ? fallbacks / calls : 0,
    byProvider: [...byProviderMap.entries()].map(([providerId, v]) => ({ providerId, ...v })),
    byFeature: [...byFeatureMap.entries()].map(([feature, v]) => {
      const prevCost = prevCostByFeature.get(feature) ?? 0;
      const growthPct = prevCost > 0 ? ((v.costBRL - prevCost) / prevCost) * 100 : 0;
      return { feature, calls: v.calls, costBRL: v.costBRL, growthPct };
    }),
    series: [...seriesMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, v]) => ({ date, ...v })),
  };
}
