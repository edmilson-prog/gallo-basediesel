export type SellerPeriodKey = "hoje" | "7d" | "30d";

export interface ISellerPeriodWindow {
  key: SellerPeriodKey;
  label: string;
  startIso: string;
  endIso: string;
  previousStartIso: string;
  previousEndIso: string;
}

const DAY_MS = 24 * 60 * 60 * 1000;
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

const PERIOD_DAYS: Record<"7d" | "30d", number> = { "7d": 7, "30d": 30 };
const PERIOD_LABELS: Record<SellerPeriodKey, string> = {
  hoje: "Hoje",
  "7d": "7 dias",
  "30d": "30 dias",
};

/**
 * Midnight of the BRT calendar day containing `iso`, as a UTC ISO instant.
 * BRT is a fixed UTC-3 offset (Brazil has had no DST since 2019), so this is
 * a plain arithmetic shift — same technique as `engine/hourlyActivity.ts`.
 */
function brtMidnightIso(iso: string): string {
  const brt = new Date(new Date(iso).getTime() - BRT_OFFSET_MS);
  const midnightUtcMs =
    Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate()) + BRT_OFFSET_MS;
  return new Date(midnightUtcMs).toISOString();
}

/**
 * Resolves a window ending at `nowIso`, plus a comparison window for
 * deltas.
 *
 * "hoje" uses the BRT calendar day (00:00 BRT to now) for the current
 * window, and the SAME elapsed duration at the same time yesterday for the
 * previous window (not the full previous day) — so "vs período anterior"
 * compares like-for-like instead of a partial day against a full one. The
 * hourly chart (`engine/hourlyActivity.ts`) buckets by BRT calendar day
 * from hour 0, so its bar-sum always matches the "Atendimentos" KPI total
 * for "hoje".
 *
 * "7d"/"30d" start at BRT midnight N-1 days back — i.e. N whole calendar
 * days, the last of which is today so far. A rolling `now - N days` start
 * would land mid-day, making `buildTrendDaily` emit N+1 buckets whose first
 * and last bars each cover only part of a day: a chart headed "7 dias"
 * showing 8 bars, two of them visibly short for no reason the seller can see.
 */
export function resolveSellerPeriod(key: SellerPeriodKey, nowIso: string): ISellerPeriodWindow {
  const todayStartMs = new Date(brtMidnightIso(nowIso)).getTime();
  const nowMs = new Date(nowIso).getTime();

  if (key === "hoje") {
    const startIso = new Date(todayStartMs).toISOString();
    const elapsedMs = nowMs - todayStartMs;
    const previousStartIso = new Date(todayStartMs - DAY_MS).toISOString();
    const previousEndIso = new Date(todayStartMs - DAY_MS + elapsedMs).toISOString();
    return {
      key,
      label: PERIOD_LABELS.hoje,
      startIso,
      endIso: nowIso,
      previousStartIso,
      previousEndIso,
    };
  }

  const days = PERIOD_DAYS[key];
  const startMs = todayStartMs - (days - 1) * DAY_MS;
  // The comparison window is the N whole calendar days immediately before,
  // truncated to the same time-of-day so a partial "today" is never measured
  // against a full day.
  const previousStartMs = startMs - days * DAY_MS;
  const previousEndMs = previousStartMs + (nowMs - startMs);
  return {
    key,
    label: PERIOD_LABELS[key],
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(nowMs).toISOString(),
    previousStartIso: new Date(previousStartMs).toISOString(),
    previousEndIso: new Date(previousEndMs).toISOString(),
  };
}
