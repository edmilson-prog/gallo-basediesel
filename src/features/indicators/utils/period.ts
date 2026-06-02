import type { IndicatorPeriodType } from "@/shared/types";

/**
 * Compute default start/end ISO date strings for the given period type,
 * anchored to `ref` (defaults to today).
 *
 * Returns YYYY-MM-DD strings (date-only, no time part) so they work
 * directly as `<input type="date" />` values.
 */
export function computePeriodDates(
  type: IndicatorPeriodType,
  ref: Date = new Date(),
): { start: string; end: string } {
  const y = ref.getFullYear();
  const m = ref.getMonth(); // 0-based

  switch (type) {
    case "diario": {
      const s = new Date(y, m, ref.getDate());
      return { start: toDateStr(s), end: toDateStr(s) };
    }

    case "semanal": {
      // Week starts on Monday (ISO week)
      const day = ref.getDay(); // 0 = Sun
      const diffToMon = day === 0 ? -6 : 1 - day;
      const mon = new Date(y, m, ref.getDate() + diffToMon);
      const sun = new Date(mon);
      sun.setDate(sun.getDate() + 6);
      return { start: toDateStr(mon), end: toDateStr(sun) };
    }

    case "mensal": {
      const s = new Date(y, m, 1);
      const e = new Date(y, m + 1, 0); // last day of the month
      return { start: toDateStr(s), end: toDateStr(e) };
    }

    case "trimestral": {
      const quarterStart = Math.floor(m / 3) * 3;
      const s = new Date(y, quarterStart, 1);
      const e = new Date(y, quarterStart + 3, 0);
      return { start: toDateStr(s), end: toDateStr(e) };
    }

    case "anual": {
      return {
        start: toDateStr(new Date(y, 0, 1)),
        end: toDateStr(new Date(y, 11, 31)),
      };
    }
  }
}

function toDateStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
