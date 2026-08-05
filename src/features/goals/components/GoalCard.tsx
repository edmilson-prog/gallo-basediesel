import { useNavigate } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import type { IGoal, IGoalProgress } from "@/shared/types";
import { GOALS_STRINGS as S } from "../i18n/pt-BR";
import { formatGoalValue } from "../utils/formatGoalValue";
import { GoalProgressBar } from "./GoalProgressBar";
import { GoalStatusBadge } from "./GoalStatusBadge";
import { GoalTypeBadge } from "./GoalTypeBadge";

export interface IGoalCardProps {
  goal: IGoal;
  progress: IGoalProgress;
}

export function GoalCard({ goal, progress }: IGoalCardProps) {
  const navigate = useNavigate();
  const handleOpen = () => void navigate({ to: "/app/gestao/metas/$id", params: { id: goal.id } });

  const daysRemainingLabel =
    progress.daysRemaining === 1 ? S.daysRemainingOneLabel : S.daysRemainingLabel;

  return (
    <Card className="flex h-full flex-col gap-4 p-5">
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="line-clamp-2 text-sm font-semibold text-foreground" title={goal.name}>
            {goal.name ?? "Meta"}
          </h3>
          <GoalTypeBadge metric={goal.metric} size="sm" />
        </div>
        <GoalStatusBadge mode="progress" value={progress.status} size="sm" />
      </header>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-semibold tracking-tight text-foreground">
            {formatGoalValue(goal.metric, progress.currentValue, "compact")}
          </span>
          <span className="text-xs text-muted-foreground">
            / {formatGoalValue(goal.metric, goal.targetValue, "compact")}
          </span>
        </div>
        <GoalProgressBar percentage={progress.percentage} status={progress.status} showLabel />
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Icon icon="mdi:calendar-clock-outline" size={13} />
          {progress.daysRemaining} {daysRemainingLabel}
        </span>
        <span>
          {S.projectionLabel}:{" "}
          <span className="font-medium text-foreground">
            {formatGoalValue(goal.metric, progress.projection, "compact")}
          </span>
        </span>
      </div>

      {goal.rewardDescription && (
        <p className="rounded-md bg-severity-warning/10 px-3 py-2 text-xs text-severity-warning">
          <Icon icon="mdi:gift-outline" size={13} className="mr-1 inline" />
          {goal.rewardDescription}
        </p>
      )}

      <Button type="button" variant="outline" size="sm" onClick={handleOpen} className="mt-auto">
        <Icon icon="mdi:eye-outline" size={14} className="mr-1" />
        {S.viewDetailsCta}
      </Button>
    </Card>
  );
}
