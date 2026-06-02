/**
 * Shared chart color utilities used across features (indicators, goals, etc.)
 */

/**
 * Returns a Recharts-compatible hex fill color based on a progress percentage.
 * ≥ 100 % → emerald-600, ≥ 70 % → amber-500, < 70 % → red-600
 */
export function progressColorFor(pct: number): string {
  if (pct >= 100) return "#16a34a"; // emerald-600
  if (pct >= 70) return "#f59e0b"; // amber-500
  return "#dc2626"; // red-600
}
