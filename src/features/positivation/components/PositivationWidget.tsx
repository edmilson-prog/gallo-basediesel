import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Icon } from "@/components/Icon";
import { formatPercent } from "@/shared/utils/format";
import type { ID } from "@/shared/types";
import {
  resolvePositivationWindow,
  DEFAULT_POSITIVATION_FILTERS,
} from "../hooks/usePositivationFilters";
import { usePositivationMetrics } from "../hooks/usePositivationMetrics";
import { POSITIVATION_STRINGS as S } from "../i18n/pt-BR";

export interface IPositivationWidgetProps {
  storeId?: ID;
  sellerId?: ID;
}

/**
 * Compact positivation widget for the Manager Dashboard (PRD-014 integration).
 * Shows the month-to-date positivation rate as a single KPI + inline progress
 * bar with a link to the dedicated page (`/app/gestao/positivacao`).
 */
export function PositivationWidget({ storeId, sellerId }: IPositivationWidgetProps) {
  const window = resolvePositivationWindow(DEFAULT_POSITIVATION_FILTERS, "current");
  const previousWindow = resolvePositivationWindow(DEFAULT_POSITIVATION_FILTERS, "previous");
  const { metrics, isLoading } = usePositivationMetrics({
    window,
    previousWindow,
    scope: { storeId, sellerId },
  });

  const positivated = metrics?.positivatedCount ?? 0;
  const total = metrics?.totalCustomers ?? 0;
  const rate = metrics?.positivationRate ?? 0;
  const projection = metrics?.projection ?? 0;
  const ratePct = Math.round(rate * 100);
  const empty = !isLoading && total === 0;

  return (
    <Card className="flex h-full flex-col gap-3 p-5">
      <header className="flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground">
          <Icon icon="mdi:account-check-outline" size={18} className="text-primary" />
          {S.widgetTitle}
        </h2>
        <Link to="/app/gestao/positivacao" className="text-xs text-primary hover:underline">
          {S.widgetViewAll}
        </Link>
      </header>
      {isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-2 w-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      ) : empty ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{S.widgetEmpty}</p>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-2xl font-semibold tracking-tight text-foreground">
              {formatPercent(rate)}
            </span>
            <span className="text-xs text-muted-foreground">
              {S.widgetSubtitle(positivated, total)}
            </span>
          </div>
          <Progress value={ratePct} className="h-2" />
          <p className="text-[11px] text-muted-foreground">
            Projeção fim do período:{" "}
            <span className="font-medium text-foreground">
              {projection.toLocaleString("pt-BR")}
            </span>{" "}
            ({formatPercent(metrics?.projectionRate ?? 0)})
          </p>
        </>
      )}
    </Card>
  );
}
