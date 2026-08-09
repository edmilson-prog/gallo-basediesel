import type { IGoal } from "@/shared/types";

const DAY_MS = 24 * 60 * 60 * 1000;
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;

export interface IGoalPaceResult {
  percent: number;
  remaining: number;
  paceLabel: string;
  projectedDate: string | null;
}

function formatDayMonth(iso: string): string {
  const d = new Date(iso);
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${day}/${month}`;
}

/** `YYYY-MM-DD` of an ISO instant, read in UTC. */
function utcDateKey(iso: string): string {
  return iso.slice(0, 10);
}

/** `YYYY-MM-DD` of the BRT (fixed UTC-3) calendar day containing `now`. */
function brtDateKey(now: Date): string {
  return new Date(now.getTime() - BRT_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Whether a goal's period covers today, compared at day granularity.
 *
 * The goal form persists `period.end` as UTC midnight of the last day
 * (`new Date("2026-07-31").toISOString()` → `2026-07-31T00:00:00.000Z`), which
 * is 21:00 BRT of the 30th. A plain instant comparison (`now <= period.end`)
 * therefore drops the goal roughly two days early — exactly during the closing
 * stretch of the month. Comparing the stored bounds' UTC date keys against
 * today's BRT date key keeps the goal active through its final day.
 */
export function isGoalPeriodCurrent(goal: IGoal, now: Date = new Date()): boolean {
  const today = brtDateKey(now);
  return utcDateKey(goal.period.start) <= today && today <= utcDateKey(goal.period.end);
}

/**
 * Progress + projected pace for a goal.
 *
 * `currentValue` MUST be the live figure derived from paid orders
 * (`calculateGoalProgress` in the goals feature) — never `goal.currentValue`,
 * which is a stale snapshot that is never written in production.
 */
export function deriveGoalPace(
  goal: IGoal,
  currentValue: number,
  now: Date = new Date(),
): IGoalPaceResult {
  const percent = goal.targetValue > 0 ? Math.round((currentValue / goal.targetValue) * 100) : 0;
  const remaining = Math.max(0, goal.targetValue - currentValue);

  if (currentValue >= goal.targetValue) {
    return { percent, remaining: 0, paceLabel: "meta batida", projectedDate: null };
  }

  const startMs = new Date(goal.period.start).getTime();
  const endMs = new Date(goal.period.end).getTime();
  const totalDays = Math.max(1, Math.round((endMs - startMs) / DAY_MS));
  const daysPassed = Math.max(
    0,
    Math.min(totalDays, Math.round((now.getTime() - startMs) / DAY_MS)),
  );

  if (daysPassed <= 0) {
    return { percent, remaining, paceLabel: "aguardando dados do mês", projectedDate: null };
  }

  const dailyRate = currentValue / daysPassed;
  if (dailyRate <= 0) {
    return {
      percent,
      remaining,
      paceLabel: "sem ritmo suficiente para projetar",
      projectedDate: null,
    };
  }

  const daysToTarget = Math.ceil(goal.targetValue / dailyRate);
  const projectedMs = startMs + daysToTarget * DAY_MS;
  const projectedDate = new Date(projectedMs).toISOString();

  const paceLabel =
    projectedMs <= endMs
      ? `no ritmo para bater em ${formatDayMonth(projectedDate)}`
      : `abaixo do ritmo — no ritmo atual bateria em ${formatDayMonth(projectedDate)}`;

  return { percent, remaining, paceLabel, projectedDate };
}
