import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatPercent } from "@/shared/utils/format";
import type { ITrendInfo } from "@/features/manager-dashboard/utils/kpiMath";
import { POSITIVATION_STRINGS as S } from "../i18n/pt-BR";

export interface IPositivationKpisProps {
  totalCustomers: number;
  positivatedCount: number;
  positivationRate: number;
  projection: number;
  atRiskCount: number;
  trends: {
    positivationRate: ITrendInfo;
    positivatedCount: ITrendInfo;
    atRisk: ITrendInfo;
  };
  isLoading?: boolean;
}

interface IKpiProps {
  icon: string;
  label: string;
  help: string;
  value: string;
  isLoading?: boolean;
  trend?: ITrendInfo;
  trendLabel?: string;
}

function TrendBadge({ trend }: { trend: ITrendInfo }) {
  if (trend.direction === "flat" && trend.changePct === null) return null;
  const colorClass = trend.isImprovement
    ? "text-emerald-600 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10"
    : trend.changePct === 0
      ? "text-muted-foreground bg-muted/60"
      : "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-500/10";
  const iconName =
    trend.direction === "up"
      ? "mdi:arrow-top-right"
      : trend.direction === "down"
        ? "mdi:arrow-bottom-right"
        : "mdi:minus";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        colorClass,
      )}
    >
      <Icon icon={iconName} size={14} />
      {trend.changePct === null ? "novo" : `${trend.changePct > 0 ? "+" : ""}${trend.changePct}%`}
    </span>
  );
}

function Kpi({ icon, label, help, value, isLoading, trend, trendLabel }: IKpiProps) {
  return (
    <Card className="flex h-full flex-col gap-2 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon icon={icon} size={20} />
          </span>
          <div className="flex flex-col">
            <span className="text-sm font-medium text-foreground">{label}</span>
            <span className="text-xs text-muted-foreground">{help}</span>
          </div>
        </div>
        {trend && !isLoading && <TrendBadge trend={trend} />}
      </div>
      {isLoading ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <span className="text-2xl font-semibold tracking-tight text-foreground">{value}</span>
      )}
      {trendLabel && !isLoading && (
        <span className="text-[11px] text-muted-foreground">{trendLabel}</span>
      )}
    </Card>
  );
}

export function PositivationKpis({
  totalCustomers,
  positivatedCount,
  positivationRate,
  projection,
  atRiskCount,
  trends,
  isLoading,
}: IPositivationKpisProps) {
  return (
    <section
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5"
      aria-label="Indicadores de positivação"
    >
      <Kpi
        icon="mdi:account-multiple-outline"
        label={S.kpiBase}
        help={S.kpiBaseHelp}
        value={totalCustomers.toLocaleString("pt-BR")}
        isLoading={isLoading}
      />
      <Kpi
        icon="mdi:account-check-outline"
        label={S.kpiPositivated}
        help={S.kpiPositivatedHelp}
        value={positivatedCount.toLocaleString("pt-BR")}
        isLoading={isLoading}
        trend={trends.positivatedCount}
        trendLabel={S.kpiVsPrevious}
      />
      <Kpi
        icon="mdi:percent-outline"
        label={S.kpiRate}
        help={S.kpiRateHelp}
        value={formatPercent(positivationRate)}
        isLoading={isLoading}
        trend={trends.positivationRate}
        trendLabel={S.kpiVsPrevious}
      />
      <Kpi
        icon="mdi:trending-up"
        label={S.kpiProjection}
        help={S.kpiProjectionHelp}
        value={projection.toLocaleString("pt-BR")}
        isLoading={isLoading}
      />
      <Kpi
        icon="mdi:account-alert-outline"
        label={S.kpiAtRisk}
        help={S.kpiAtRiskHelp}
        value={atRiskCount.toLocaleString("pt-BR")}
        isLoading={isLoading}
        trend={trends.atRisk}
        trendLabel={S.kpiVsPrevious}
      />
    </section>
  );
}
