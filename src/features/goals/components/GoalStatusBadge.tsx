import type { GoalStatus } from "@/shared/types";
import type { GoalProgressStatus } from "@/shared/types/goals";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import {
  GOAL_PROGRESS_STATUS_ICON,
  GOAL_PROGRESS_STATUS_LABEL,
  GOAL_STATUS_LABEL,
} from "../utils/labels";

const PROGRESS_COLORS: Record<GoalProgressStatus, string> = {
  no_caminho: "border-severity-success/40 bg-severity-success/10 text-severity-success",
  atencao: "border-severity-warning/40 bg-severity-warning/10 text-severity-warning",
  atrasada: "border-severity-critical/40 bg-severity-critical/10 text-severity-critical",
  concluida: "border-severity-success/60 bg-severity-success/20 text-severity-success",
};

const LIFECYCLE_COLORS: Record<GoalStatus, string> = {
  ativa: "bg-primary/10 text-primary border-primary/40",
  concluida: "border-severity-success/40 bg-severity-success/10 text-severity-success",
  arquivada: "bg-muted text-muted-foreground border-border",
  cancelada: "border-severity-critical/40 bg-severity-critical/10 text-severity-critical",
};

const LIFECYCLE_ICONS: Record<GoalStatus, string> = {
  ativa: "mdi:play-circle-outline",
  concluida: "mdi:trophy-outline",
  arquivada: "mdi:archive-outline",
  cancelada: "mdi:close-circle-outline",
};

export interface IGoalStatusBadgeProps {
  mode: "progress" | "lifecycle";
  value: GoalProgressStatus | GoalStatus;
  size?: "sm" | "md";
  className?: string;
}

export function GoalStatusBadge({ mode, value, size = "md", className }: IGoalStatusBadgeProps) {
  if (mode === "progress") {
    const v = value as GoalProgressStatus;
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium",
          size === "sm" ? "text-[10px]" : "text-xs",
          PROGRESS_COLORS[v],
          className,
        )}
      >
        <Icon icon={GOAL_PROGRESS_STATUS_ICON[v]} size={size === "sm" ? 11 : 13} />
        {GOAL_PROGRESS_STATUS_LABEL[v]}
      </span>
    );
  }

  const v = value as GoalStatus;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-medium",
        size === "sm" ? "text-[10px]" : "text-xs",
        LIFECYCLE_COLORS[v],
        className,
      )}
    >
      <Icon icon={LIFECYCLE_ICONS[v]} size={size === "sm" ? 11 : 13} />
      {GOAL_STATUS_LABEL[v]}
    </span>
  );
}
