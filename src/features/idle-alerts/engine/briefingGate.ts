import type { IIdleSummary } from "@/shared/types";

/** Briefing shows ONLY right after an explicit login and when something is pending. */
export function shouldShowBriefing(
  explicitLogin: boolean,
  summary: IIdleSummary | undefined,
): boolean {
  if (!explicitLogin || !summary) return false;
  return summary.counts.level1 + summary.counts.level2 + summary.counts.level3 > 0;
}
