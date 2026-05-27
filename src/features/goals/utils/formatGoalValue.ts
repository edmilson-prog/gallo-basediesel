import type { GoalMetric } from "@/shared/types";
import { formatBRL, formatBRLCompact } from "@/shared/utils/format";
import { GOAL_METRIC_FORMAT } from "./labels";

/** Format a goal value (currentValue or targetValue) according to its metric type. */
export function formatGoalValue(
  metric: GoalMetric,
  value: number,
  variant: "full" | "compact" = "full",
): string {
  const format = GOAL_METRIC_FORMAT[metric];
  if (format === "currency") {
    return variant === "compact" ? formatBRLCompact(value) : formatBRL(value);
  }
  if (format === "percent") {
    return `${value.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  }
  return value.toLocaleString("pt-BR");
}
