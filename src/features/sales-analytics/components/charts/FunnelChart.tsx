import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/shared/utils/format";
import type { IFunnelStage } from "../../hooks/useFunnelMetrics";
import { SALES_ANALYTICS_STRINGS as S } from "../../i18n/pt-BR";

export interface IFunnelChartProps {
  stages: IFunnelStage[];
  bottleneckIndex: number | null;
  isLoading?: boolean;
}

const STAGE_LABELS: Record<IFunnelStage["id"], string> = {
  leads: S.funnelStageLeads,
  qualified: S.funnelStageQualified,
  quotes_sent: S.funnelStageQuotesSent,
  quotes_accepted: S.funnelStageQuotesAccepted,
  orders_paid: S.funnelStageOrdersPaid,
};

/**
 * Custom 5-stage vertical funnel. Recharts has no first-class funnel that
 * scales cleanly, so we draw it ourselves — each row's width is proportional
 * to its share of the largest stage, with the bottleneck row outlined.
 */
export function FunnelChart({ stages, bottleneckIndex, isLoading }: IFunnelChartProps) {
  if (isLoading) {
    return (
      <Card className="flex flex-col gap-3 p-5">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-72 w-full" />
      </Card>
    );
  }

  const total = stages[0]?.count ?? 0;
  const empty = stages.every((s) => s.count === 0);

  return (
    <Card className="flex flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-foreground">
            {S.funnelTitle}
          </h2>
          <p className="text-xs text-muted-foreground">{S.funnelSubtitle}</p>
        </div>
        {bottleneckIndex !== null ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 dark:bg-amber-500/10 dark:text-amber-300">
            <Icon icon="mdi:alert-circle-outline" size={14} />
            {S.funnelBottleneck}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
            <Icon icon="mdi:check-circle-outline" size={14} />
            {S.funnelHealthy}
          </span>
        )}
      </header>

      {empty ? (
        <p className="py-10 text-center text-sm text-muted-foreground">{S.funnelEmpty}</p>
      ) : (
        <ol className="flex flex-col gap-2" aria-label="Etapas do funil">
          {stages.map((stage, idx) => {
            const widthPct = total > 0 ? Math.max(6, (stage.count / total) * 100) : 6;
            const isBottleneck = idx === bottleneckIndex;
            return (
              <li key={stage.id} className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between text-xs">
                  <span className="font-medium text-foreground">{STAGE_LABELS[stage.id]}</span>
                  <span className="font-mono text-muted-foreground">
                    {stage.count.toLocaleString("pt-BR")}
                    {stage.conversionFromPrevious !== null && (
                      <span className="ml-2 text-muted-foreground/70">
                        ({formatPercent(stage.conversionFromPrevious)} {S.funnelStageOf})
                      </span>
                    )}
                  </span>
                </div>
                <div className="relative h-9 w-full overflow-hidden rounded-md bg-muted/40">
                  <div
                    className={cn(
                      "h-full rounded-md transition-all duration-300",
                      isBottleneck ? "bg-amber-500/30 ring-2 ring-amber-500/70" : "bg-primary/30",
                    )}
                    style={{ width: `${widthPct}%` }}
                  />
                  <div className="absolute inset-0 flex items-center px-3 text-xs font-medium text-foreground">
                    {stage.sampleIds.length > 0 && (
                      <span className="text-muted-foreground/80">
                        {stage.sampleIds.length === 5 ? "5+" : stage.sampleIds.length} amostras
                      </span>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}
