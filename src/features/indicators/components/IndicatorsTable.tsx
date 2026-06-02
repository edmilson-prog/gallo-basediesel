import { useNavigate } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { GoalProgressBar } from "@/features/goals/components/GoalProgressBar";
import { GoalStatusBadge } from "@/features/goals/components/GoalStatusBadge";
import { formatDateBR } from "@/shared/utils/format";
import type { IIndicatorWithProgress } from "../hooks/useIndicators";
import { indicatorsPtBR as S } from "../i18n/pt-BR";
import { formatByMetric } from "../utils/format";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function IndicatorsTable({
  rows,
  isLoading,
  sellerNames,
  emptyText,
}: {
  rows: IIndicatorWithProgress[];
  isLoading?: boolean;
  sellerNames: Map<string, string>;
  emptyText?: string;
}) {
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
        {emptyText ?? S.empty}
      </Card>
    );
  }

  return (
    <Card className="flex flex-col p-0">
      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">Recorte</th>
              <th className="px-4 py-3">Métrica</th>
              <th className="px-4 py-3">Escopo</th>
              <th className="px-4 py-3">Período</th>
              <th className="px-4 py-3 text-right">Alvo</th>
              <th className="px-4 py-3">Progresso</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Projeção</th>
              <th className="w-[44px]"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ indicator, progress }) => {
              const scopeLabel =
                indicator.scopeLevel === "individual"
                  ? (sellerNames.get(indicator.sellerId ?? "") ?? S.scope.individual)
                  : S.scope[indicator.scopeLevel];

              return (
                <tr
                  key={indicator.id}
                  className="cursor-pointer border-b border-border/40 transition-colors hover:bg-muted/40"
                  onClick={() =>
                    void navigate({
                      to: "/app/gestao/indicadores/$id",
                      params: { id: indicator.id },
                    })
                  }
                >
                  <td className="max-w-[240px] truncate px-4 py-3 font-medium text-foreground">
                    {indicator.name}
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                      {S.selectorKind[indicator.selector.kind]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                      {S.metric[indicator.metric]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{scopeLabel}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {formatDateBR(indicator.period.start)} → {formatDateBR(indicator.period.end)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs">
                    {formatByMetric(indicator.metric, indicator.targetValue, "compact")}
                  </td>
                  <td className="min-w-[180px] px-4 py-3">
                    <div className="flex flex-col gap-1">
                      <GoalProgressBar
                        percentage={progress.percentage}
                        status={progress.status}
                        size="sm"
                      />
                      <span className="text-[11px] text-muted-foreground">
                        {formatByMetric(indicator.metric, progress.currentValue, "compact")} ·{" "}
                        {progress.percentage.toLocaleString("pt-BR", {
                          maximumFractionDigits: 1,
                        })}
                        %
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <GoalStatusBadge mode="progress" value={progress.status} size="sm" />
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-xs text-muted-foreground">
                    {formatByMetric(indicator.metric, progress.projection, "compact")}
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
