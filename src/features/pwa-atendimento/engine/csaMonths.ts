/**
 * The month strip of the Análise tab.
 *
 * The desktop uses a `<Select>` with every month. At 412px a select is a modal
 * over a modal, so the kit trades it for three chips: the reference month and
 * the two before it. Moving to the oldest chip shifts the window, so the whole
 * history is still reachable — one tap at a time instead of one scroll.
 */

/** `2026-08` — the shape `useCustomerServiceMetrics` expects. */
export type MonthKey = string;

const MONTH_ABBR = [
  "jan",
  "fev",
  "mar",
  "abr",
  "mai",
  "jun",
  "jul",
  "ago",
  "set",
  "out",
  "nov",
  "dez",
] as const;

export function monthKeyOf(date: Date): MonthKey {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** Parses `2026-08`; returns null rather than guessing on anything else. */
export function parseMonthKey(key: MonthKey): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(key.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) return null;
  return { year, month };
}

/** Shifts a month key by `delta` months, wrapping the year. */
export function shiftMonth(key: MonthKey, delta: number): MonthKey {
  const parsed = parseMonthKey(key);
  if (!parsed) return key;
  return monthKeyOf(new Date(Date.UTC(parsed.year, parsed.month - 1 + delta, 1)));
}

/** `ago/26` — short enough for a 412px strip. */
export function monthLabelOf(key: MonthKey): string {
  const parsed = parseMonthKey(key);
  if (!parsed) return key;
  return `${MONTH_ABBR[parsed.month - 1]}/${String(parsed.year).slice(-2)}`;
}

export interface IMonthChip {
  key: MonthKey;
  label: string;
  isSelected: boolean;
}

/**
 * The three chips, oldest first, with the selected month on the right.
 *
 * Never offers a month in the future: there is no data there, and a chip that
 * always answers "sem dados" trains people to distrust the screen.
 */
export function monthStrip(selected: MonthKey, today: Date): IMonthChip[] {
  const current = monthKeyOf(today);
  const anchor = parseMonthKey(selected) ? selected : current;
  const capped = anchor > current ? current : anchor;
  return [-2, -1, 0].map((delta) => {
    const key = shiftMonth(capped, delta);
    return { key, label: monthLabelOf(key), isSelected: key === capped };
  });
}
