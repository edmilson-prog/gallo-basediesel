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
  no_caminho:
    "bg-emerald-500/10 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300 border-emerald-500/40",
  atencao:
    "bg-amber-500/10 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300 border-amber-500/40",
  atrasada: "bg-red-500/10 text-red-700 dark:bg-red-500/15 dark:text-red-300 border-red-500/40",
  concluida:
    "bg-emerald-600/20 text-emerald-800 dark:bg-emerald-500/25 dark:text-emerald-200 border-emerald-500/60",
};

const LIFECYCLE_COLORS: Record<GoalStatus, string> = {
  ativa: "bg-primary/10 text-primary border-primary/40",
  concluida: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/40",
  arquivada: "bg-muted text-muted-foreground border-border",
  cancelada: "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/40",
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
