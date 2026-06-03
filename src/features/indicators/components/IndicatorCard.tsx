import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { GoalProgressBar } from "@/features/goals/components/GoalProgressBar";
import { GoalStatusBadge } from "@/features/goals/components/GoalStatusBadge";
import type { IIndicatorWithProgress } from "../hooks/useIndicators";
import { indicatorsPtBR as S } from "../i18n/pt-BR";
import { formatByMetric } from "../utils/format";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function IndicatorCard({ item }: { item: IIndicatorWithProgress }) {
  const { indicator, progress } = item;
  return (
    <Card className="flex h-full flex-col gap-4 p-5">
      <header className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-1">
          <h3 className="line-clamp-2 text-sm font-semibold text-foreground" title={indicator.name}>
            {indicator.name}
          </h3>
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
            {S.metric[indicator.metric]}
          </span>
        </div>
        <GoalStatusBadge mode="progress" value={progress.status} size="sm" />
      </header>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-semibold tracking-tight text-foreground">
            {formatByMetric(indicator.metric, progress.currentValue, "compact")}
          </span>
          <span className="text-xs text-muted-foreground">
            / {formatByMetric(indicator.metric, indicator.targetValue, "compact")}
          </span>
        </div>
        <GoalProgressBar percentage={progress.percentage} status={progress.status} showLabel />
      </div>

      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <Icon icon="mdi:calendar-clock-outline" size={13} />
          {progress.daysRemaining}{" "}
          {progress.daysRemaining === 1 ? "dia restante" : "dias restantes"}
        </span>
        <span>
          Projeção:{" "}
          <span className="font-medium text-foreground">
            {formatByMetric(indicator.metric, progress.projection, "compact")}
          </span>
        </span>
      </div>
    </Card>
  );
}
