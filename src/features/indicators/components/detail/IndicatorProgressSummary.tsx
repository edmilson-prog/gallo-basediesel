import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import type { GoalProgressStatus, IProductIndicator } from "@/shared/types";
import { GoalProgressBar } from "@/features/goals/components/GoalProgressBar";
import { GoalStatusBadge } from "@/features/goals/components/GoalStatusBadge";
import { indicatorsPtBR as S } from "../../i18n/pt-BR";
import { formatByMetric } from "../../utils/format";

export interface IIndicatorProgressSummaryProps {
  indicator: IProductIndicator;
  currentValue: number;
  percentage: number;
  projection: number;
  daysRemaining: number;
  status: GoalProgressStatus;
}

export function IndicatorProgressSummary({
  indicator,
  currentValue,
  percentage,
  projection,
  daysRemaining,
  status,
}: IIndicatorProgressSummaryProps) {
  const projectionPct =
    indicator.targetValue > 0 ? Math.round((projection / indicator.targetValue) * 100) : 0;
  const urgent = daysRemaining > 0 && daysRemaining < 5;
  const daysLabel = daysRemaining === 1 ? S.daysRemainingOneLabel : S.daysRemainingLabel;

  return (
    <Card className="flex flex-col gap-5 p-6">
      <header className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          {S.detailSummaryTitle}
        </h2>
        <GoalStatusBadge mode="progress" value={status} />
      </header>

      <div className="flex flex-col gap-3">
        <div className="flex items-end justify-between gap-3">
          <div className="flex flex-col">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
              {S.detailSummaryAchieved}
            </span>
            <span className="text-3xl font-semibold tracking-tight text-foreground">
              {formatByMetric(indicator.metric, currentValue, "full")}
            </span>
            <span className="text-xs text-muted-foreground">
              {S.detailSummaryTarget}:{" "}
              {formatByMetric(indicator.metric, indicator.targetValue, "full")}
            </span>
          </div>
          <span className="text-5xl font-bold tracking-tight text-primary">
            {percentage.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%
          </span>
        </div>
        <GoalProgressBar percentage={percentage} status={status} size="lg" />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col rounded-md border border-border bg-muted/30 p-3">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            {S.detailSummaryProjection}
          </span>
          <span className="text-lg font-semibold text-foreground">
            {formatByMetric(indicator.metric, projection, "full")}
          </span>
          <span className="text-xs text-muted-foreground">
            {projectionPct}% da meta · {S.pacingLabel.toLowerCase()}
          </span>
        </div>
        <div
          className={cn(
            "flex flex-col rounded-md border p-3",
            urgent ? "border-severity-critical/40 bg-severity-critical/5" : "border-border bg-muted/30",
          )}
        >
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">
            Tempo restante
          </span>
          <span
            className={cn(
              "text-lg font-semibold",
              urgent ? "text-severity-critical" : "text-foreground",
            )}
          >
            {daysRemaining} {daysLabel}
          </span>
          {urgent && (
            <span className="inline-flex items-center gap-1 text-xs text-severity-critical">
              <Icon icon="mdi:clock-alert-outline" size={13} />
              Faltam poucos dias
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}
