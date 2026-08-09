import type { LeadFunnelStageKind } from "@/shared/types";

export interface ITriageInput {
  kind: LeadFunnelStageKind;
  /** The stage's REAL total, from `getBoardSummary` — not what is loaded. */
  count: number;
  /** `lead_funnels.entry_alert_threshold`, editable by staff. */
  threshold: number;
  oldestEnteredAt: string | undefined;
  now: Date;
}

export interface ITriageView {
  active: boolean;
  count: number;
  /** Days the oldest lead has been sitting there; null when unknown. */
  oldestDays: number | null;
}

const DAY_MS = 86_400_000;

/**
 * Whether the entry column should stop being a pile of cards.
 *
 * Only the ENTRY stage. A "Em negociação" column with a thousand leads is a
 * sales problem, not a triage one, and switching its mode would hide somebody's
 * work behind a panel telling them to go somewhere else.
 *
 * The count is the server-side total, so the panel says "903" while the column
 * itself had loaded forty — which is the whole point of showing it.
 */
export function resolveTriageMode({
  kind,
  count,
  threshold,
  oldestEnteredAt,
  now,
}: ITriageInput): ITriageView {
  // `count > 0` guards a misconfigured threshold: zero or negative must not
  // turn an empty column into an alarm.
  const active = kind === "entrada" && count > 0 && count > threshold;

  const oldestDays = oldestEnteredAt
    ? Math.max(0, Math.floor((now.getTime() - new Date(oldestEnteredAt).getTime()) / DAY_MS))
    : null;

  return { active, count, oldestDays };
}
