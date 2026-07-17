import type { IIdleSummary } from "@/shared/types";

/** Total pending across levels. */
export function totalPending(counts: IIdleSummary["counts"]): number {
  return counts.level1 + counts.level2 + counts.level3;
}

/** Worst (most severe) level present; 1 when only attention-level entries exist. */
export function worstLevel(counts: IIdleSummary["counts"]): 1 | 2 | 3 {
  if (counts.level3 > 0) return 3;
  if (counts.level2 > 0) return 2;
  return 1;
}
