import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import type { ID } from "@/shared/types";
import { useStoreIndicators } from "../hooks/useIndicators";
import { indicatorsPtBR as S } from "../i18n/pt-BR";
import { formatByMetric } from "../utils/format";
import { GoalProgressBar } from "@/features/goals/components/GoalProgressBar";
import { GoalStatusBadge } from "@/features/goals/components/GoalStatusBadge";

export interface IIndicatorsWidgetProps {
  storeId: ID;
}

const LIMIT = 5;

/**
 * Compact "Indicadores do mês" widget for the Manager Dashboard (PRD-014 integration).
 * Lists active indicators sorted by progress descending (highest attainment first),
 * capped at LIMIT entries.
 */
export function IndicatorsWidget({ storeId }: IIndicatorsWidgetProps) {
  const { items, isLoading, hasError } = useStoreIndicators(storeId);

  const active = items.filter(({ indicator }) => indicator.status === "ativo");
  const sorted = [...active].sort((a, b) => b.progress.percentage - a.progress.percentage);
  const limited = sorted.slice(0, LIMIT);

  return (
    <Card className="flex h-full flex-col gap-3 p-5">
      <header className="flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
          <Icon icon="mdi:chart-bar" size={18} className="text-primary" />
          {S.widgetTitle}
        </h2>
        <Link to="/app/gestao/indicadores" className="text-xs text-primary hover:underline">
          {S.widgetViewAll}
        </Link>
      </header>

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : hasError ? (
        <p className="py-6 text-center text-sm text-destructive">{S.widgetError}</p>
      ) : limited.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{S.widgetEmpty}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border/40">
          {limited.map(({ indicator, progress }) => (
            <li key={indicator.id}>
              <Link
                to="/app/gestao/indicadores/$id"
                params={{ id: indicator.id }}
                className="flex flex-col gap-1.5 py-2 transition-colors hover:bg-muted/40"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className="line-clamp-1 text-sm font-medium text-foreground"
                    title={indicator.name}
                  >
                    {indicator.name}
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
                <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>
                    {formatByMetric(indicator.metric, progress.currentValue, "compact")} /{" "}
                    {formatByMetric(indicator.metric, indicator.targetValue, "compact")}
                  </span>
                  <GoalStatusBadge mode="progress" value={progress.status} size="sm" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
