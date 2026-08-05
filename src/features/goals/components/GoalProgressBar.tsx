import type { GoalProgressStatus } from "@/shared/types/goals";
import { cn } from "@/lib/utils";

const FILL_COLORS: Record<GoalProgressStatus, string> = {
  no_caminho: "bg-severity-success",
  atencao: "bg-severity-warning",
  atrasada: "bg-severity-critical",
  concluida: "bg-severity-success",
};

const TRACK_COLORS: Record<GoalProgressStatus, string> = {
  no_caminho: "bg-severity-success/10",
  atencao: "bg-severity-warning/10",
  atrasada: "bg-severity-critical/10",
  concluida: "bg-severity-success/10",
};

const HEIGHT_BY_SIZE = {
  sm: "h-1.5",
  md: "h-2.5",
  lg: "h-4",
} as const;

export interface IGoalProgressBarProps {
  percentage: number;
  status: GoalProgressStatus;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
  className?: string;
}

export function GoalProgressBar({
  percentage,
  status,
  size = "md",
  showLabel = false,
  className,
}: IGoalProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, percentage));
  const overshoot = percentage > 100;
  return (
    <div className={cn("w-full", className)}>
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-full",
          HEIGHT_BY_SIZE[size],
          TRACK_COLORS[status],
        )}
      >
        <div
          className={cn("h-full rounded-full transition-all duration-300", FILL_COLORS[status])}
          style={{ width: `${clamped}%` }}
          aria-valuenow={Math.round(percentage)}
          aria-valuemin={0}
          aria-valuemax={100}
          role="progressbar"
        />
      </div>
      {showLabel && (
        <div className="mt-1 flex items-baseline justify-end gap-1 text-[11px] text-muted-foreground">
          <span
            className={cn(
              "font-mono font-semibold",
              overshoot ? "text-severity-success" : "text-foreground",
            )}
          >
            {percentage.toLocaleString("pt-BR", {
              minimumFractionDigits: 0,
              maximumFractionDigits: 1,
            })}
            %
          </span>
        </div>
      )}
    </div>
  );
}
