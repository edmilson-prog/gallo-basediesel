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
 * Resolves a window ending at `nowIso`, plus the matching-length window
 * right before it (for delta comparisons).
 *
 * "hoje" uses the BRT calendar day (00:00 BRT to now) rather than a rolling
 * 24h window — this must agree with `bucketConversationsByHour`
 * (`engine/hourlyActivity.ts`), which buckets by BRT calendar day too, so
 * the "Atendimentos" KPI total and the sum of the hourly chart bars match
 * for the same period. "7d"/"30d" use plain rolling N-day windows.
 */
export function resolveSellerPeriod(key: SellerPeriodKey, nowIso: string): ISellerPeriodWindow {
  if (key === "hoje") {
    const startIso = brtMidnightIso(nowIso);
    const previousStartIso = new Date(new Date(startIso).getTime() - DAY_MS).toISOString();
    return {
      key,
      label: PERIOD_LABELS.hoje,
      startIso,
      endIso: nowIso,
      previousStartIso,
      previousEndIso: startIso,
    };
  }

  const endMs = new Date(nowIso).getTime();
  const days = PERIOD_DAYS[key];
  const startMs = endMs - days * DAY_MS;
  const previousStartMs = startMs - days * DAY_MS;
  return {
    key,
    label: PERIOD_LABELS[key],
    startIso: new Date(startMs).toISOString(),
    endIso: new Date(endMs).toISOString(),
    previousStartIso: new Date(previousStartMs).toISOString(),
    previousEndIso: new Date(startMs).toISOString(),
  };
}
