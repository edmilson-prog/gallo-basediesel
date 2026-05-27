import type { IGamificationPeriod } from "../engine/calculateSellerScore";

/** Type alias surfaced by the page filters (URL-sync). */
export type RankingPeriodType = "mensal" | "trimestral" | "anual";

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0));
}

function endOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 23, 59, 59, 999));
}

function quarterIndex(d: Date): number {
  return Math.floor(d.getUTCMonth() / 3);
}

function monthRef(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

/** Resolve a `IGamificationPeriod` from a type and a reference date. */
export function resolvePeriod(
  type: RankingPeriodType,
  reference: Date = new Date(),
): IGamificationPeriod {
  if (type === "mensal") {
    const start = startOfMonth(reference);
    const end = endOfMonth(reference);
    return {
      type: "mensal",
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      ref: monthRef(start),
    };
  }
  if (type === "trimestral") {
    const q = quarterIndex(reference);
    const start = new Date(Date.UTC(reference.getUTCFullYear(), q * 3, 1));
    const end = new Date(Date.UTC(reference.getUTCFullYear(), q * 3 + 3, 0, 23, 59, 59, 999));
    return {
      type: "trimestral",
      startIso: start.toISOString(),
      endIso: end.toISOString(),
      ref: `${start.getUTCFullYear()}-Q${q + 1}`,
    };
  }
  const start = new Date(Date.UTC(reference.getUTCFullYear(), 0, 1));
  const end = new Date(Date.UTC(reference.getUTCFullYear(), 11, 31, 23, 59, 59, 999));
  return {
    type: "anual",
    startIso: start.toISOString(),
    endIso: end.toISOString(),
    ref: String(start.getUTCFullYear()),
  };
}

/** Shift a period back by one unit (used to compute the comparison window). */
export function previousPeriod(period: IGamificationPeriod): IGamificationPeriod {
  const start = new Date(period.startIso);
  if (period.type === "mensal") {
    const prev = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 1, 1));
    return resolvePeriod("mensal", prev);
  }
  if (period.type === "trimestral") {
    const prev = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - 3, 1));
    return resolvePeriod("trimestral", prev);
  }
  const prev = new Date(Date.UTC(start.getUTCFullYear() - 1, 0, 1));
  return resolvePeriod("anual", prev);
}

const PERIOD_LABELS: Record<RankingPeriodType, string> = {
  mensal: "Mês atual",
  trimestral: "Trimestre atual",
  anual: "Ano atual",
};

export function labelForPeriod(period: IGamificationPeriod): string {
  return PERIOD_LABELS[period.type];
}
