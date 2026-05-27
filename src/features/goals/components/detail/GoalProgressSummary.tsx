import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type { IGoal, IGoalProgress } from "@/shared/types";
import { GOALS_STRINGS as S } from "../../i18n/pt-BR";
import { formatGoalValue } from "../../utils/formatGoalValue";
import { GoalProgressBar } from "../GoalProgressBar";
import { GoalStatusBadge } from "../GoalStatusBadge";

export interface IGoalProgressSummaryProps {
  goal: IGoal;
  progress: IGoalProgress;
}

export function GoalProgressSummary({ goal, progress }: IGoalProgressSummaryProps) {
  const projectionPct =
    goal.targetValue > 0 ? Math.round((progress.projection / goal.targetValue) * 100) : 0;
  const urgent = progress.daysRemaining > 0 && progress.daysRemaining < 5;
  const daysLabel = progress.daysRemaining === 1 ? S.daysRemainingOneLabel : S.daysRemainingLabel;

  return (
    <Card className="flex flex-col gap-5 p-6">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          {S.detailSummaryTitle}
        </h2>
        <GoalStatusBadge mode="progress" value={progress.status} />
      </header>

      <div className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              {S.detailSummaryAchieved}
            </span>
            <span className="text-3xl font-semibold tracking-tight text-foreground">
              {formatGoalValue(goal.metric, progress.currentValue)}
            </span>
            <span className="text-xs text-muted-foreground">
              {S.detailSummaryTarget}: {formatGoalValue(goal.metric, goal.targetValue)}
            </span>
          </div>
          <span className="text-5xl font-bold tracking-tight text-primary">
            {progress.percentage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
          </span>
        </div>
        <GoalProgressBar percentage={progress.percentage} status={progress.status} size="lg" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col rounded-md border border-border bg-muted/30 p-3">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {S.detailSummaryProjection}
          </span>
          <span className="text-lg font-semibold text-foreground">
            {formatGoalValue(goal.metric, progress.projection)}
          </span>
          <span className="text-xs text-muted-foreground">
            {projectionPct}% da meta · {S.pacingLabel.toLowerCase()}
          </span>
        </div>
        <div
          className={cn(
            "flex flex-col rounded-md border p-3",
            urgent ? "border-red-500/40 bg-red-500/5" : "border-border bg-muted/30",
          )}
        >
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Tempo restante
          </span>
          <span
            className={cn(
              "text-lg font-semibold",
              urgent ? "text-red-600 dark:text-red-400" : "text-foreground",
            )}
          >
            {progress.daysRemaining} {daysLabel}
          </span>
          {urgent && (
            <span className="inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400">
              <Icon icon="mdi:clock-alert-outline" size={13} />
              Faltam poucos dias
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
