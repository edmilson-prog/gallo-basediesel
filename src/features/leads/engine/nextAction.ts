import type { LeadNextActionKind } from "@/shared/types";

export type NextActionWhen = "today" | "tomorrow" | "thisWeek";

export interface INextActionPreset {
  kind: LeadNextActionKind;
  icon: string;
  when: NextActionWhen;
}

/**
 * The four ways out of a stalled lead.
 *
 * A closed set, deliberately: the point is that the exits are named and
 * countable, not that anybody can type a sentence into them. Each carries the
 * deadline it implies — "ligar agora" that is due next week is not the same
 * promise, and asking for a date picker on every one of them is how the
 * previous screen ended up with nobody setting an action at all.
 */
export const NEXT_ACTION_PRESETS: readonly INextActionPreset[] = [
  { kind: "ligar", icon: "mdi:phone", when: "today" },
  { kind: "orcamento", icon: "mdi:file-document-outline", when: "today" },
  { kind: "retomar", icon: "mdi:chat-outline", when: "tomorrow" },
  { kind: "visita", icon: "mdi:calendar-account", when: "thisWeek" },
];

const OFFSET_DAYS: Record<NextActionWhen, number> = {
  today: 0,
  tomorrow: 1,
  thisWeek: 7,
};

/**
 * The due timestamp for a preset.
 *
 * Midnight LOCAL, not `new Date("yyyy-mm-dd")` — that parses as midnight UTC,
 * which in every negative offset (São Paulo included) lands on the previous day
 * once `getNextActionInfo` reads it back through `startOfDay` in local time. An
 * action marked "hoje" would render as one day overdue on the spot.
 *
 * The server side still holds: `lead_funnel_board_summary` treats the UTC DATE
 * PART of `next_action_at` as the due date (see funnels/engine/funnelMetrics),
 * and at UTC-03:00 local midnight is 03:00Z on the same calendar day, so both
 * readings agree. That agreement is what makes this safe — it depends on the
 * app's São Paulo offset being negative, which is the same assumption the SQL
 * function already documents.
 */
export function resolveDueDate(when: NextActionWhen, now: Date = new Date()): string {
  const due = new Date(now);
  due.setHours(0, 0, 0, 0);
  due.setDate(due.getDate() + OFFSET_DAYS[when]);
  return due.toISOString();
}

/** Whole days from `now` to the due date; positive when overdue. */
export function daysOverdue(iso: string, now: Date = new Date()): number {
  const due = new Date(iso);
  due.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - due.getTime()) / 86_400_000);
}
