import type { ID, IFunnelBoardSummary, ILeadFunnelEntry, ISO8601 } from "@/shared/types";

/**
 * São Paulo is a fixed UTC-03:00 offset (Brazil has had no DST since 2019) —
 * same precedent as src/features/access/engine/workSchedule.ts. Kept as a
 * small local helper (not imported from workSchedule.ts) so this pure engine
 * never depends on another feature.
 */
const SAO_PAULO_OFFSET_MINUTES = 180;

/**
 * CROSS-CHECK RULE (mirrored in the SQL function lead_funnel_board_summary):
 * "overdue" compares CALENDAR DATES, not instants. `nextActionAt` is written
 * as UTC midnight of a date-only picker value (see leads/utils/leadDraft.ts),
 * so its UTC date part IS the intended due date — it must NOT be shifted into
 * São Paulo before taking its date (that would move the due date back a day).
 * Only `now` gets shifted, to derive "today" in São Paulo. A membership is
 * overdue when its due date is strictly before today's São Paulo date.
 */
function utcDateOnly(iso: ISO8601): string {
  const d = new Date(iso);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Today's calendar date in São Paulo, derived from a fixed -03:00 offset. */
function saoPauloDateOnly(date: Date): string {
  const shifted = new Date(date.getTime() - SAO_PAULO_OFFSET_MINUTES * 60_000);
  return utcDateOnly(shifted.toISOString());
}

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
  const todaySaoPaulo = saoPauloDateOnly(input.now);
  let count = 0;
  let sumValue = 0;
  let overdueCount = 0;

  for (const entry of input.entries) {
    // Filter to THIS stage — a caller passing a whole funnel's entries (every
    // stage mixed together) must get this column's own figure back, not the
    // funnel's total silently mislabelled with this stageId.
    if (entry.stageId !== input.stageId) continue;
    count += 1;

    // The MEMBERSHIP value, never the lead's: the same opportunity would
    // otherwise be counted in full inside every funnel it touches.
    sumValue += entry.estimatedValue ?? 0;

    const nextAction = input.nextActionByLeadId[entry.leadId];
    if (nextAction && utcDateOnly(nextAction) < todaySaoPaulo) {
      overdueCount += 1;
    }
  }

  return { stageId: input.stageId, count, sumValue, overdueCount };
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
