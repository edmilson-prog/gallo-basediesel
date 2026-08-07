import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";

import type { ID } from "@/shared/types/common";
import type { IForecastScenario } from "@/shared/types/forecast";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { GoalStatusBadge } from "@/features/goals/components/GoalStatusBadge";
import { GoalProgressBar } from "@/features/goals/components/GoalProgressBar";
import { formatGoalValue } from "@/features/goals/utils/formatGoalValue";

import { useForecast } from "../hooks/useForecast";

export interface IForecastWidgetProps {
  /** Defaults to "00000000-0000-0000-0000-000000000001" like the other cockpit widgets. */
  storeId?: ID;
}

/** Picks the "provável" scenario, falling back to the first available one. */
function pickLikely(scenarios: IForecastScenario[]): IForecastScenario | undefined {
  return scenarios.find((scenario) => scenario.type === "provavel") ?? scenarios[0];
}

/** Stacked composition bar reused inline as a compact (h-1.5) breakdown. */
function MiniBreakdown({ scenario }: { scenario: IForecastScenario }) {
  const segments = [
    { key: "realized", value: scenario.breakdown.realized, className: "bg-primary" },
    {
      key: "weightedPipeline",
      value: scenario.breakdown.weightedPipeline,
      className: "bg-primary/45",
    },
    {
      key: "runRateRemainder",
      value: scenario.breakdown.runRateRemainder,
      className: "bg-muted-foreground/30",
    },
  ];
  const total = segments.reduce((sum, segment) => sum + Math.max(0, segment.value), 0);

  return (
    <div
      role="img"
      aria-label="Composição: realizado, pipeline ponderado, ritmo"
      className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted"
    >
      {segments.map((segment) => {
        const width = total > 0 ? (Math.max(0, segment.value) / total) * 100 : 0;
        if (width <= 0) return null;
        return (
          <div
            key={segment.key}
            aria-hidden
            className={cn("h-full transition-all duration-300", segment.className)}
            style={{ width: `${width}%` }}
          />
        );
      })}
    </div>
  );
}

/**
 * Compact closing-forecast widget for the Executive Cockpit (PRD-056). Shows the
 * "provável" scenario for store revenue. It fails isolated: on error it renders a
 * small inline message with retry instead of throwing, so it never breaks the
 * cockpit grid.
 */
export function ForecastWidget({ storeId = "00000000-0000-0000-0000-000000000001" }: IForecastWidgetProps) {
  const queryClient = useQueryClient();
  const { forecast, isLoading, hasError } = useForecast({ storeId, metric: "revenue" });

  const retry = () => {
    void queryClient.invalidateQueries();
  };

  const header = (
    <header className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <h2 className="text-sm font-semibold tracking-tight text-foreground">
          Forecast de fechamento
        </h2>
        <Icon icon="mdi:chart-timeline" size={18} className="text-primary" />
      </div>
      <Link to="/app/gestao/forecast" className="text-xs text-primary hover:underline">
        Ver forecast
      </Link>
    </header>
  );

  let body: React.ReactNode;

  if (isLoading) {
    body = (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton className="h-1.5 w-full" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-1.5 w-full" />
      </div>
    );
  } else if (hasError) {
    body = (
      <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
        <span>Não foi possível carregar o forecast.</span>
        <button
          type="button"
          onClick={retry}
          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          <Icon icon="mdi:refresh" size={14} />
          Tentar novamente
        </button>
      </div>
    );
  } else {
    const likely = forecast ? pickLikely(forecast.scenarios) : undefined;

    if (!forecast || !likely) {
      body = <p className="text-sm text-muted-foreground">Dados insuficientes para projetar</p>;
    } else {
      const hasTarget = forecast.targetValue !== undefined && forecast.targetValue > 0;
      const percentage = hasTarget
        ? (forecast.realizedValue / (forecast.targetValue as number)) * 100
        : 0;
      const gap = likely.gapToTarget ?? 0;
      const gapPercent = likely.gapPercent ?? 0;

      body = (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <p className="text-2xl font-semibold tracking-tight text-foreground tabular-nums">
              {formatGoalValue("revenue", likely.projectedValue)}
            </p>
            {hasTarget && <GoalProgressBar percentage={percentage} status={likely.status} />}
          </div>

          {hasTarget ? (
            <div className="flex flex-wrap items-center gap-2">
              <GoalStatusBadge mode="progress" value={likely.status} size="sm" />
              <span className="text-sm text-foreground">
                {gap > 0
                  ? `Faltam ${formatGoalValue("revenue", gap)} (${(gapPercent * 100).toFixed(1)}%)`
                  : `${formatGoalValue("revenue", -gap)} acima da meta`}
              </span>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">Sem meta definida para o período</span>
          )}

          <MiniBreakdown scenario={likely} />

          {forecast.lowConfidence && (
            <p className="flex items-center gap-1 text-xs text-severity-warning">
              <Icon icon="mdi:alert-circle-outline" size={13} />
              Projeção pouco confiável — poucos dias decorridos.
            </p>
          )}
        </div>
      );
    }
  }

  return (
    <Card className="flex h-full flex-col gap-3 p-5">
      {header}
      {body}
    </Card>
  );
}
