import { useNavigate } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import type { IGoalWithProgress } from "../hooks/useGoalsWithProgress";
import { GOALS_STRINGS as S } from "../i18n/pt-BR";
import { GOAL_LEVEL_LABEL } from "../utils/labels";
import { formatGoalValue } from "../utils/formatGoalValue";
import { formatDateBR } from "@/shared/utils/format";
import { GoalProgressBar } from "./GoalProgressBar";
import { GoalStatusBadge } from "./GoalStatusBadge";
import { GoalTypeBadge } from "./GoalTypeBadge";

export interface IGoalsTableProps {
  rows: IGoalWithProgress[];
  isLoading?: boolean;
  emptyText?: string;
  /** Optional seller-id → name map to enrich the Escopo column. */
  sellerNames?: Map<string, string>;
}

export function GoalsTable({ rows, isLoading, emptyText, sellerNames }: IGoalsTableProps) {
  const navigate = useNavigate();

  if (isLoading) {
    return (
      <Card className="p-5">
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card className="flex items-center justify-center p-10 text-sm text-muted-foreground">
        {emptyText ?? S.emptyGestor}
      </Card>
    );
  }

  return (
    <Card className="flex flex-col p-0">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3">{S.tableColName}</th>
              <th className="px-4 py-3">{S.tableColType}</th>
              <th className="px-4 py-3">{S.tableColScope}</th>
              <th className="px-4 py-3">{S.tableColDates}</th>
              <th className="px-4 py-3 text-right">{S.tableColTarget}</th>
              <th className="px-4 py-3">{S.tableColProgress}</th>
              <th className="px-4 py-3">{S.tableColStatus}</th>
              <th className="px-4 py-3 text-right">{S.tableColProjection}</th>
              <th className="w-[44px]"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ goal, progress }) => {
              const scopeLabel =
                goal.level === "individual"
                  ? (sellerNames?.get(goal.targetId) ?? GOAL_LEVEL_LABEL.individual)
                  : GOAL_LEVEL_LABEL[goal.level];
              return (
                <tr
                  key={goal.id}
                  className="cursor-pointer border-b border-border/40 transition-colors hover:bg-muted/40"
                  onClick={() =>
                    void navigate({ to: "/app/gestao/metas/$id", params: { id: goal.id } })
                  }
                >
                  <td className="max-w-[280px] truncate px-4 py-3 font-medium text-foreground">
                    {goal.name ?? goal.id}
                  </td>
                  <td className="px-4 py-3">
                    <GoalTypeBadge metric={goal.metric} size="sm" />
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{scopeLabel}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatDateBR(goal.period.start)} → {formatDateBR(goal.period.end)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {formatGoalValue(goal.metric, goal.targetValue, "compact")}
                  </td>
                  <td className="min-w-[180px] px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <GoalProgressBar
                        percentage={progress.percentage}
                        status={progress.status}
                        size="sm"
                      />
                      <span className="text-[11px] text-muted-foreground">
                        {formatGoalValue(goal.metric, progress.currentValue, "compact")} ·{" "}
                        {progress.percentage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <GoalStatusBadge mode="progress" value={progress.status} size="sm" />
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                    {formatGoalValue(goal.metric, progress.projection, "compact")}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Icon icon="mdi:chevron-right" size={16} className="text-muted-foreground" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
