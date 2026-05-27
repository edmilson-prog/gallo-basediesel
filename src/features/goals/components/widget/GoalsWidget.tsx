import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import type { ID } from "@/shared/types";
import { useStoreGoals } from "../../hooks/useStoreGoals";
import { GOALS_STRINGS as S } from "../../i18n/pt-BR";
import { formatGoalValue } from "../../utils/formatGoalValue";
import { GoalProgressBar } from "../GoalProgressBar";

export interface IGoalsWidgetProps {
  storeId: ID;
}

const LIMIT = 5;

/**
 * Compact "Metas do mês" widget for the Manager Dashboard (PRD-014 integration).
 * Lists the active goals ordered by lowest progress first — the ones that need
 * the manager's attention most urgently.
 */
export function GoalsWidget({ storeId }: IGoalsWidgetProps) {
  const { items, isLoading } = useStoreGoals(storeId);

  const sorted = [...items].sort((a, b) => a.progress.percentage - b.progress.percentage);
  const limited = sorted.slice(0, LIMIT);

  return (
    <Card className="flex h-full flex-col gap-3 p-5">
      <header className="flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
          <Icon icon="mdi:target" size={18} className="text-primary" />
          {S.widgetTitle}
        </h2>
        <Link to="/app/gestao/metas" className="text-xs text-primary hover:underline">
          {S.widgetViewAll}
        </Link>
      </header>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : limited.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{S.widgetEmpty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/40">
          {limited.map(({ goal, progress }) => (
            <li key={goal.id}>
              <Link
                to="/app/gestao/metas/$id"
                params={{ id: goal.id }}
                className="flex flex-col gap-1.5 py-2 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className="line-clamp-1 text-sm font-medium text-foreground"
                    title={goal.name}
                  >
                    {goal.name ?? goal.id}
                  </span>
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {progress.percentage.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%
                  </span>
                </div>
                <GoalProgressBar
                  percentage={progress.percentage}
                  status={progress.status}
                  size="sm"
                />
                <div className="flex items-baseline justify-between text-[11px] text-muted-foreground">
                  <span>
                    {formatGoalValue(goal.metric, progress.currentValue, "compact")} /{" "}
                    {formatGoalValue(goal.metric, goal.targetValue, "compact")}
                  </span>
                  <span>{progress.daysRemaining} d</span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
