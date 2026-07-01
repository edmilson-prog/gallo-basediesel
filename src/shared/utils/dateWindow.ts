export interface IPreviousWindow {
  prevFromIso: string;
  prevToIso: string;
}

/**
 * Previous window of the same length, immediately preceding `fromIso`.
 * Used to compute the comparison period for trend badges (KPI cards).
 */
export function previousWindowOfEqualSpan(fromIso: string, toIso: string): IPreviousWindow {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  const span = Math.max(0, to - from);
  return {
    prevFromIso: new Date(from - span - 1).toISOString(),
    prevToIso: new Date(from - 1).toISOString(),
  };
}
