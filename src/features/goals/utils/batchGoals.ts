import type { GoalMetric, GoalStatus, ID, IGoal } from "@/shared/types";
import { GOAL_METRIC_LABEL } from "./labels";

/** pt-BR month abbreviations, index 0 = January. */
export const MONTH_LABELS = [
  "Jan", "Fev", "Mar", "Abr", "Mai", "Jun",
  "Jul", "Ago", "Set", "Out", "Nov", "Dez",
] as const;

/** Full pt-BR month names for goal naming, index 0 = January. */
const MONTH_FULL = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
] as const;

/** ISO start (day 1, 00:00) and end (last day, 23:59:59.999) of a month. */
export function monthRangeISO(year: number, monthIdx: number): { startIso: string; endIso: string } {
  const start = new Date(year, monthIdx, 1, 0, 0, 0, 0);
  const end = new Date(year, monthIdx + 1, 0, 23, 59, 59, 999);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/** Auto goal name, e.g. "Faturamento mensal — Junho 2026". */
export function monthlyGoalName(metric: GoalMetric, year: number, monthIdx: number): string {
  return `${GOAL_METRIC_LABEL[metric]!} mensal — ${MONTH_FULL[monthIdx]!} ${year}`;
}

export interface IConflictArgs {
  existingGoals: IGoal[];
  storeId: ID;
  sellerId: ID;
  metric: GoalMetric;
  year: number;
  monthIdx: number;
}

/**
 * True when an active individual monthly goal already overlaps this month for the
 * same seller + metric. Mirrors findDuplicateGoal's overlap rule in validation.ts.
 */
export function detectMonthConflict(args: IConflictArgs): boolean {
  const { startIso, endIso } = monthRangeISO(args.year, args.monthIdx);
  const start = new Date(startIso);
  const end = new Date(endIso);
  return args.existingGoals.some((g) => {
    if ((g.status ?? "ativa") !== "ativa") return false;
    if (g.metric !== args.metric) return false;
    if (g.level !== "individual") return false;
    if (g.storeId !== args.storeId) return false;
    if (g.targetId !== args.sellerId) return false;
    const overlapStart = start <= new Date(g.period.end);
    const overlapEnd = end >= new Date(g.period.start);
    return overlapStart && overlapEnd;
  });
}

export interface IBuildMonthlyGoalArgs {
  storeId: ID;
  sellerId: ID;
  metric: GoalMetric;
  year: number;
  monthIdx: number;
  targetValue: number;
  rewardDescription?: string;
  status: GoalStatus;
  createdBy: ID;
}

/** Build a full IGoal for one (seller, month) cell. */
export function buildMonthlyGoal(args: IBuildMonthlyGoalArgs): IGoal {
  const { startIso, endIso } = monthRangeISO(args.year, args.monthIdx);
  const nowIso = new Date().toISOString();
  return {
    id: `goal-${args.year}-${String(args.monthIdx + 1).padStart(2, "0")}-${args.sellerId}-${args.metric}-${Date.now()}`,
    storeId: args.storeId,
    level: "individual",
    targetId: args.sellerId,
    sellerId: args.sellerId,
    period: { type: "monthly", start: startIso, end: endIso },
    metric: args.metric,
    targetValue: args.targetValue,
    currentValue: 0,
    progressPercent: 0,
    division: "parts",
    name: monthlyGoalName(args.metric, args.year, args.monthIdx),
    status: args.status,
    rewardDescription: args.rewardDescription,
    createdBy: args.createdBy,
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}
