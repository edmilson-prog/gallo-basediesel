/** "2015–2024" or "2015–atual". Null when the model carries no start year. */
export function formatYearRange(yearStart?: number, yearEnd?: number): string | null {
  if (!yearStart) return null;
  return `${yearStart}–${yearEnd != null ? String(yearEnd) : "atual"}`;
}
