const DAY_MS = 24 * 60 * 60 * 1000;

export interface ICoverageProgress {
  /** Whole days still to run, floored at 0. */
  daysLeft: number;
  /** Elapsed fraction of the window, 0–1 — drives the progress bar. */
  elapsed: number;
  /** True once the window has run out (the job just hasn't fired yet). */
  isOver: boolean;
}

/**
 * How far a temporary coverage has run.
 *
 * `daysLeft` rounds UP so the last partial day still reads "faltam 1 dia"
 * instead of "faltam 0": the customers are genuinely still on loan until the
 * auto-revert fires, and rounding down would announce a return that has not
 * happened. A window with no end date (or a malformed one) reports as over,
 * since there is nothing left to count down to.
 */
export function coverageProgress(
  startDate: string | undefined,
  endDate: string | undefined,
  now: Date = new Date(),
): ICoverageProgress {
  const end = endDate ? new Date(endDate).getTime() : Number.NaN;
  if (Number.isNaN(end)) return { daysLeft: 0, elapsed: 1, isOver: true };

  const start = startDate ? new Date(startDate).getTime() : Number.NaN;
  const current = now.getTime();
  const remainingMs = end - current;

  if (remainingMs <= 0) return { daysLeft: 0, elapsed: 1, isOver: true };

  const daysLeft = Math.ceil(remainingMs / DAY_MS);

  // Without a usable start there is no window to measure against, so the bar
  // stays empty rather than inventing a proportion.
  if (Number.isNaN(start) || end <= start) return { daysLeft, elapsed: 0, isOver: false };

  const elapsed = (current - start) / (end - start);
  return { daysLeft, elapsed: Math.min(1, Math.max(0, elapsed)), isOver: false };
}
