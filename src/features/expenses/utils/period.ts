export type ExpensePeriodKind = "mensal" | "trimestral" | "anual";

const MONTHS_PT = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];

/** Current month as `YYYY-MM`. */
export function currentMonthKey(now: Date = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Human label for a `YYYY-MM` key (e.g. "Janeiro 2026"). */
export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  if (!y || !m) return key;
  return `${MONTHS_PT[m - 1]} ${y}`;
}

/** Label for a resolved period given the kind. */
export function periodLabel(monthKey: string, kind: ExpensePeriodKind): string {
  const [y, m] = monthKey.split("-").map(Number);
  if (!y || !m) return monthKey;
  if (kind === "anual") return `${y}`;
  if (kind === "trimestral") return `${Math.floor((m - 1) / 3) + 1}º trimestre ${y}`;
  return monthLabel(monthKey);
}

/**
 * Resolve inclusive `[startIso, endIso]` for a competence window anchored on a
 * `YYYY-MM` month, scaled to the period kind. Mirrors the DRE bounds logic.
 */
export function resolveCompetenceBounds(
  monthKey: string,
  kind: ExpensePeriodKind,
): { startIso: string; endIso: string } {
  const [year, month] = monthKey.split("-").map(Number);
  const now = new Date();
  const y = year || now.getUTCFullYear();
  const m = month || now.getUTCMonth() + 1;
  if (kind === "anual") {
    return {
      startIso: new Date(Date.UTC(y, 0, 1)).toISOString(),
      endIso: new Date(Date.UTC(y, 12, 0, 23, 59, 59, 999)).toISOString(),
    };
  }
  if (kind === "trimestral") {
    const q = Math.floor((m - 1) / 3);
    return {
      startIso: new Date(Date.UTC(y, q * 3, 1)).toISOString(),
      endIso: new Date(Date.UTC(y, q * 3 + 3, 0, 23, 59, 59, 999)).toISOString(),
    };
  }
  return {
    startIso: new Date(Date.UTC(y, m - 1, 1)).toISOString(),
    endIso: new Date(Date.UTC(y, m, 0, 23, 59, 59, 999)).toISOString(),
  };
}

/** Build a stable list of selectable month keys (most recent first). */
export function buildMonthOptions(count = 12, now: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}
