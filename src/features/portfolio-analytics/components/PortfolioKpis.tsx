import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { formatPercent } from "@/shared/utils/format";
import { PORTFOLIO_STRINGS as S } from "../i18n/pt-BR";
import type { IPortfolioByStatus, IPortfolioMetrics } from "../engine/calculatePortfolioMetrics";

export interface IPortfolioKpisProps {
  total: number;
  byStatus: IPortfolioByStatus;
  metrics: IPortfolioMetrics | null;
  isLoading?: boolean;
}

interface IKpiProps {
  icon: string;
  label: string;
  help: string;
  value: string;
  accent?: "neutral" | "good" | "warn" | "bad";
  isLoading?: boolean;
}

function accentClasses(accent: IKpiProps["accent"]) {
  switch (accent) {
    case "good":
      return "bg-severity-success/10 text-severity-success";
    case "warn":
      return "bg-severity-warning/10 text-severity-warning";
    case "bad":
      return "bg-severity-critical/10 text-severity-critical";
    case "neutral":
    default:
      return "bg-primary/10 text-primary";
  }
}

function Kpi({ icon, label, help, value, accent = "neutral", isLoading }: IKpiProps) {
  return (
    <Card className="flex h-full flex-col gap-2 p-4">
      <div className="flex items-start gap-2">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${accentClasses(accent)}`}
        >
          <Icon icon={icon} size={20} />
        </span>
        <div className="flex flex-col">
          <span className="text-sm font-medium text-foreground">{label}</span>
          <span className="text-xs text-muted-foreground">{help}</span>
        </div>
      </div>
      {isLoading ? (
        <Skeleton className="h-8 w-24" />
      ) : (
        <span className="text-2xl font-semibold tracking-tight text-foreground">{value}</span>
      )}
    </Card>
  );
}

function safePct(part: number, total: number): number {
  if (total <= 0) return 0;
  return part / total;
}

export function PortfolioKpis({ total, byStatus, metrics, isLoading }: IPortfolioKpisProps) {
  const activePct = safePct(byStatus.ativo, total);
  const dormantPct = safePct(byStatus.dormente, total);
  const lostPct = safePct(byStatus.perdido, total);
  const churn = metrics?.churn.activeToDormant ?? 0;
  const churnLost = metrics?.churn.activeToLost ?? 0;
  const recovery = (metrics?.recovery.dormantToActive ?? 0) + (metrics?.recovery.lostToActive ?? 0);
  const growth = metrics?.growth.netGrowth ?? 0;

  return (
    <section
      className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7"
      aria-label="Indicadores de saúde da carteira"
    >
      <Kpi
        icon="mdi:account-multiple-outline"
        label={S.kpiTotal}
        help={S.kpiTotalHelp}
        value={total.toLocaleString("pt-BR")}
        isLoading={isLoading}
      />
      <Kpi
        icon="mdi:account-check-outline"
        label={S.kpiActivePct}
        help={S.kpiActivePctHelp}
        value={formatPercent(activePct)}
        accent="good"
        isLoading={isLoading}
      />
      <Kpi
        icon="mdi:account-clock-outline"
        label={S.kpiDormantPct}
        help={S.kpiDormantPctHelp}
        value={formatPercent(dormantPct)}
        accent="warn"
        isLoading={isLoading}
      />
      <Kpi
        icon="mdi:account-cancel-outline"
        label={S.kpiLostPct}
        help={S.kpiLostPctHelp}
        value={formatPercent(lostPct)}
        accent="bad"
        isLoading={isLoading}
      />
      <Kpi
        icon="mdi:trending-down"
        label={S.kpiChurn}
        help={S.kpiChurnHelp}
        value={(churn + churnLost).toLocaleString("pt-BR")}
        accent="bad"
        isLoading={isLoading}
      />
      <Kpi
        icon="mdi:trending-up"
        label={S.kpiRecovery}
        help={S.kpiRecoveryHelp}
        value={recovery.toLocaleString("pt-BR")}
        accent="good"
        isLoading={isLoading}
      />
      <Kpi
        icon="mdi:chart-line-variant"
        label={S.kpiGrowth}
        help={S.kpiGrowthHelp}
        value={`${growth >= 0 ? "+" : ""}${growth.toLocaleString("pt-BR")}`}
        accent={growth >= 0 ? "good" : "bad"}
        isLoading={isLoading}
      />
    </section>
  );
}
