import type { ID } from "./common";

/** Runtime-computed status used by the traffic-light visual indicator (PRD-042). */
export type GoalProgressStatus = "no_caminho" | "atencao" | "atrasada" | "concluida";

/** Pace trend over the last interval vs the previous one inside the same period. */
export type GoalProgressTrend = "subindo" | "estavel" | "caindo";

/**
 * Derived progress of a goal — computed in runtime by `calculateGoalProgress`.
 * Never persisted; consumers should call the hook each render.
 *
 * @see ../../../docs/prds/PRD-042-metas_DONE.md
 */
export interface IGoalProgress {
  goalId: ID;
  /** Current achieved value (BRL or count depending on metric). */
  currentValue: number;
  /** Percentage of `targetValue` reached (0..200). */
  percentage: number;
  /** Linear projection of where the goal will land if the pace holds. */
  projection: number;
  /** Days remaining until `endDate` (clamped at 0). */
  daysRemaining: number;
  /** Total days in the period (for "days ratio" comparisons). */
  totalDays: number;
  /** Traffic-light status. */
  status: GoalProgressStatus;
  /** Pace trend over the last interval vs the previous one. */
  trend: GoalProgressTrend;
  /** Pre-computed ratio `percentage / expectedAtDate` used by the UI. */
  paceRatio: number;
}
