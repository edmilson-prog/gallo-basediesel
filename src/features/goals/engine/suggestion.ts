import type { GoalLevel, GoalMetric, ID, IGoal } from "@/shared/types";

export interface IGoalSuggestion {
  /** Suggested target value (5% growth over previous when available). */
  suggestedTarget: number;
  /** Previous period value used as base. */
  previousValue: number;
  /** Previous period target so we can show achievement %. */
  previousTarget: number;
  /** Previous period achievement (0..1+). */
  previousAchievement: number;
  /** True when no previous data exists — caller should hide the comparison card. */
  hasPrevious: boolean;
}

const GROWTH_FACTOR = 1.05;

const METRIC_DEFAULTS: Record<GoalMetric, number> = {
  revenue: 100_000,
  margin: 25_000,
  tickets: 20,
  ticket_medio: 800,
  novos_clientes: 5,
  positivacao: 30,
  recovery: 5,
  conversion: 50,
};

/**
 * Suggest a target value for a new goal based on the latest concluded /
 * archived goal of the same metric + scope. Falls back to a metric-specific
 * default when there is no prior data.
 */
export function suggestTarget(input: {
  metric: GoalMetric;
  level: GoalLevel;
  storeId: ID;
  sellerId?: ID;
  allGoals: IGoal[];
}): IGoalSuggestion {
  const candidates = input.allGoals
    .filter((g) => g.metric === input.metric)
    .filter((g) => g.level === input.level)
    .filter((g) => g.storeId === input.storeId)
    .filter((g) => input.level !== "individual" || g.targetId === input.sellerId)
    .filter((g) => (g.status ?? "ativa") !== "cancelada");

  if (candidates.length === 0) {
    return {
      suggestedTarget: METRIC_DEFAULTS[input.metric],
      previousValue: 0,
      previousTarget: 0,
      previousAchievement: 0,
      hasPrevious: false,
    };
  }

  const sorted = [...candidates].sort(
    (a, b) => new Date(b.period.end).getTime() - new Date(a.period.end).getTime(),
  );
  const last = sorted[0];
  const previousValue = last.currentValue;
  const previousTarget = last.targetValue;
  const previousAchievement = previousTarget > 0 ? previousValue / previousTarget : 0;
  const base = previousValue > 0 ? previousValue : previousTarget;
  const suggestedTarget = Math.round(base * GROWTH_FACTOR);

  return {
    suggestedTarget,
    previousValue,
    previousTarget,
    previousAchievement,
    hasPrevious: true,
  };
}
