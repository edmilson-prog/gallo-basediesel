import type { ID, IFunnelBoardSummary, ILeadFunnelEntry, ISO8601 } from "@/shared/types";

/**
 * Distinct leads across memberships.
 *
 * With N:N the per-funnel counts must never be summed: a lead in three funnels
 * would be reported three times. Every "total leads" figure in the UI goes
 * through here; per-funnel figures come from each funnel alone.
 */
export function countDistinctLeads(entries: ILeadFunnelEntry[]): number {
  return new Set(entries.map((e) => e.leadId)).size;
}

export interface ISummariseStageInput {
  stageId: ID;
  entries: ILeadFunnelEntry[];
  /** nextActionAt lives on the LEAD, so it arrives keyed by lead id. */
  nextActionByLeadId: Record<ID, ISO8601 | undefined>;
  now: Date;
}

/** Column header aggregate: count, summed value and how many are overdue. */
export function summariseStage(input: ISummariseStageInput): IFunnelBoardSummary {
  const nowMs = input.now.getTime();
  let sumValue = 0;
  let overdueCount = 0;

  for (const entry of input.entries) {
    // The MEMBERSHIP value, never the lead's: the same opportunity would
    // otherwise be counted in full inside every funnel it touches.
    sumValue += entry.estimatedValue ?? 0;

    const nextAction = input.nextActionByLeadId[entry.leadId];
    if (nextAction && new Date(nextAction).getTime() < nowMs) {
      overdueCount += 1;
    }
  }

  return { stageId: input.stageId, count: input.entries.length, sumValue, overdueCount };
}

const DAY_MS = 86_400_000;

/**
 * Days the membership has sat in its current stage — measured from
 * `enteredStageAt`, which is per funnel, rather than from the lead's
 * `updatedAt`, where any unrelated edit reset the count.
 */
export function daysInStage(entry: ILeadFunnelEntry, now: Date = new Date()): number {
  const elapsed = now.getTime() - new Date(entry.enteredStageAt).getTime();
  return Math.max(0, Math.floor(elapsed / DAY_MS));
}
