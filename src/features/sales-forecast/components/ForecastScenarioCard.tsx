import type {
  ForecastMetric,
  ForecastScenarioType,
  IForecastScenario,
} from "@/shared/types/forecast";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { GoalStatusBadge } from "@/features/goals/components/GoalStatusBadge";
import { formatGoalValue } from "@/features/goals/utils/formatGoalValue";
import { ForecastBreakdown } from "./ForecastBreakdown";

export interface IForecastScenarioCardProps {
  scenario: IForecastScenario;
  metric: ForecastMetric;
  highlighted?: boolean;
  showBreakdown?: boolean;
}

const SCENARIO_LABEL: Record<ForecastScenarioType, string> = {
  pessimista: "Pessimista",
  provavel: "Provável",
  otimista: "Otimista",
};

const SCENARIO_ICON: Record<ForecastScenarioType, string> = {
  pessimista: "mdi:trending-down",
  provavel: "mdi:trending-neutral",
  otimista: "mdi:trending-up",
};

/**
 * A single forecast scenario (pessimista / provável / otimista). The textual
 * scenario name plus the status badge are the primary non-color signals so the
 * card meets WCAG without relying on color alone.
 */
export function ForecastScenarioCard({
  scenario,
  metric,
  highlighted = false,
  showBreakdown = false,
}: IForecastScenarioCardProps) {
  const hasTarget = scenario.gapToTarget !== undefined;
  const gap = scenario.gapToTarget ?? 0;
  const gapPercent = scenario.gapPercent ?? 0;

  return (
    <Card
      className={cn(
        "flex h-full flex-col gap-3 p-5",
        highlighted ? "border-primary/50 ring-1 ring-primary/20" : "border-border",
      )}
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-base font-semibold tracking-tight text-foreground">
            {SCENARIO_LABEL[scenario.type]}
          </span>
          <Icon icon={SCENARIO_ICON[scenario.type]} size={18} className="text-muted-foreground" />
        </div>
        {highlighted && <Badge>Provável</Badge>}
      </header>

      <p
        className={cn(
          "font-semibold tracking-tight text-foreground tabular-nums",
          highlighted ? "text-3xl" : "text-2xl",
        )}
      >
        {formatGoalValue(metric, scenario.projectedValue)}
      </p>

      {hasTarget ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <GoalStatusBadge mode="progress" value={scenario.status} size="sm" />
            <span className="text-sm text-foreground">
              {gap > 0
                ? `Faltam ${formatGoalValue(metric, gap)} (${(gapPercent * 100).toFixed(1)}%)`
                : `${formatGoalValue(metric, -gap)} acima da meta`}
            </span>
          </div>
          {scenario.ordersNeeded !== undefined && (
            <span className="text-xs text-muted-foreground">
              ≈ {scenario.ordersNeeded} pedidos para a meta
            </span>
          )}
        </div>
      ) : (
        <span className="text-sm text-muted-foreground">Sem meta definida para o período</span>
      )}

      {showBreakdown && (
        <div className="mt-1 flex flex-col gap-2 border-t border-border/60 pt-3">
          <ForecastBreakdown breakdown={scenario.breakdown} metric={metric} />
          <p className="text-xs text-muted-foreground">
            Projeção determinística (ritmo + pipeline ponderado)
          </p>
        </div>
      )}
    </Card>
  );
}
