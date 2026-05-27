import type { GoalMetric } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { GOAL_METRIC_ICON, GOAL_METRIC_SHORT_LABEL } from "../utils/labels";

export interface IGoalTypeBadgeProps {
  metric: GoalMetric;
  size?: "sm" | "md";
  className?: string;
}

export function GoalTypeBadge({ metric, size = "md", className }: IGoalTypeBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-muted-foreground",
        size === "sm" ? "text-[10px]" : "text-xs",
        className,
      )}
    >
      <Icon icon={GOAL_METRIC_ICON[metric]} size={size === "sm" ? 11 : 13} />
      {GOAL_METRIC_SHORT_LABEL[metric]}
    </span>
  );
}
