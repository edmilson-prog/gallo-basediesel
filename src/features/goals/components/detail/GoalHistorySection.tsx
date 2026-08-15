import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import type { ID } from "@/shared/types";
import { useAuditsProvider } from "@/providers/data";
import { formatDateTimeBR } from "@/shared/utils/format";
import { GOALS_STRINGS as S } from "../../i18n/pt-BR";

const ACTION_LABELS: Record<string, { label: string; icon: string }> = {
  goal_create: { label: "Meta criada", icon: "mdi:plus-circle-outline" },
  goal_update: { label: "Meta atualizada", icon: "mdi:pencil-outline" },
  goal_target_change: { label: "Target alterado", icon: "mdi:bullseye-arrow" },
  goal_status_change: { label: "Status alterado", icon: "mdi:flag-outline" },
  goal_archive: { label: "Meta arquivada", icon: "mdi:archive-outline" },
  goal_cancel: { label: "Meta cancelada", icon: "mdi:close-circle-outline" },
  goal_auto_complete: { label: "Concluída automaticamente", icon: "mdi:trophy-outline" },
  goal_auto_archive: { label: "Arquivada automaticamente", icon: "mdi:archive-clock-outline" },
};

export interface IGoalHistorySectionProps {
  goalId: ID;
}

export function GoalHistorySection({ goalId }: IGoalHistorySectionProps) {
  const auditsProvider = useAuditsProvider();
  const { data, isLoading } = useQuery({
    queryKey: ["goal-history", goalId],
    queryFn: () =>
      auditsProvider.list({
        resource: "goal",
        resourceId: goalId,
        pageSize: 50,
      }),
    staleTime: 60_000,
  });

  const entries = data?.data ?? [];

  return (
    <Card className="flex flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          {S.detailHistoryTitle}
        </h2>
        <Icon icon="mdi:history" size={20} className="text-muted-foreground" />
      </header>
      {isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : entries.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{S.detailHistoryEmpty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/40">
          {entries.map((entry) => {
            const meta = ACTION_LABELS[entry.action] ?? {
              label: entry.action,
              icon: "mdi:circle-small",
            };
            return (
              <li key={entry.id} className="flex items-start gap-3 py-2 text-sm">
                <Icon icon={meta.icon} size={16} className="mt-0.5 text-muted-foreground" />
                <div className="flex flex-1 flex-col">
                  <span className="font-medium text-foreground">{meta.label}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {entry.actorId} · {formatDateTimeBR(entry.timestamp)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
