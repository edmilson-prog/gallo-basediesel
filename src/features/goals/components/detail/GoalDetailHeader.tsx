import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import type { IGoal, IGoalProgress } from "@/shared/types";
import { formatDateBR } from "@/shared/utils/format";
import { GOAL_LEVEL_LABEL } from "../../utils/labels";
import { GOALS_STRINGS as S } from "../../i18n/pt-BR";
import { GoalStatusBadge } from "../GoalStatusBadge";
import { GoalTypeBadge } from "../GoalTypeBadge";

export interface IGoalDetailHeaderProps {
  goal: IGoal;
  progress: IGoalProgress;
  canEdit: boolean;
  sellerName?: string;
  onEdit: () => void;
  onCancel: () => void;
  onBack: () => void;
}

export function GoalDetailHeader({
  goal,
  progress,
  canEdit,
  sellerName,
  onEdit,
  onCancel,
  onBack,
}: IGoalDetailHeaderProps) {
  const scopeLabel =
    goal.level === "individual"
      ? (sellerName ?? GOAL_LEVEL_LABEL.individual)
      : GOAL_LEVEL_LABEL[goal.level];

  return (
    <Card className="flex flex-col gap-4 p-5">
      <div className="flex flex-col gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="self-start gap-1 px-2 text-xs"
          onClick={onBack}
        >
          <Icon icon="mdi:arrow-left" size={14} />
          {S.backToList}
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {goal.name ?? goal.id}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <GoalTypeBadge metric={goal.metric} />
          <GoalStatusBadge mode="progress" value={progress.status} />
          {goal.status && goal.status !== "ativa" && (
            <GoalStatusBadge mode="lifecycle" value={goal.status} />
          )}
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Icon icon="mdi:account-tie-outline" size={13} />
            {scopeLabel}
          </span>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Icon icon="mdi:calendar-range" size={13} />
            {formatDateBR(goal.period.start)} → {formatDateBR(goal.period.end)}
          </span>
        </div>
      </div>

      {canEdit && (goal.status ?? "ativa") === "ativa" && (
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={onEdit} className="gap-1">
            <Icon icon="mdi:pencil-outline" size={14} />
            {S.editCta}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="gap-1 text-red-600 hover:text-red-700 dark:text-red-400"
          >
            <Icon icon="mdi:close-circle-outline" size={14} />
            {S.cancelCta}
          </Button>
        </div>
      )}
    </Card>
  );
}
