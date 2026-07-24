import type { IGoal } from "@/shared/types";

const DAY_MS = 24 * 60 * 60 * 1000;

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

/** Progress + projected pace for a monthly goal, from its raw values. */
export function deriveGoalPace(goal: IGoal, now: Date = new Date()): IGoalPaceResult {
  const percent = goal.targetValue > 0 ? Math.round((goal.currentValue / goal.targetValue) * 100) : 0;
  const remaining = Math.max(0, goal.targetValue - goal.currentValue);

  if (goal.currentValue >= goal.targetValue) {
    return { percent, remaining: 0, paceLabel: "meta batida", projectedDate: null };
  }

  const startMs = new Date(goal.period.start).getTime();
  const endMs = new Date(goal.period.end).getTime();
  const totalDays = Math.max(1, Math.round((endMs - startMs) / DAY_MS));
  const daysPassed = Math.max(0, Math.min(totalDays, Math.round((now.getTime() - startMs) / DAY_MS)));

  if (daysPassed <= 0) {
    return { percent, remaining, paceLabel: "aguardando dados do mês", projectedDate: null };
  }

  const dailyRate = goal.currentValue / daysPassed;
  if (dailyRate <= 0) {
    return { percent, remaining, paceLabel: "sem ritmo suficiente para projetar", projectedDate: null };
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
