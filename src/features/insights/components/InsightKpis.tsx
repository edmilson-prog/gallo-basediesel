import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { INSIGHTS_STRINGS as S } from "../i18n/pt-BR";

export interface IInsightKpis {
  total: number;
  critical: number;
  medium: number;
  opportunity: number;
}

export function InsightKpis({ kpis }: { kpis: IInsightKpis }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <KpiCard
        icon="mdi:lightbulb-on-outline"
        label={S.kpiTotal}
        value={kpis.total}
        tone="default"
      />
      <KpiCard
        icon="mdi:alert-octagon-outline"
        label={S.kpiCritical}
        value={kpis.critical}
        tone="critical"
      />
      <KpiCard icon="mdi:alert-outline" label={S.kpiMedium} value={kpis.medium} tone="warning" />
      <KpiCard
        icon="mdi:rocket-launch-outline"
        label={S.kpiOpportunity}
        value={kpis.opportunity}
        tone="success"
      />
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: string;
  label: string;
  value: number;
  tone: "default" | "critical" | "warning" | "success";
}) {
  const accent = {
    default: "bg-primary/10 text-primary",
    critical: "bg-destructive/15 text-destructive",
    warning: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  }[tone];
  const valueClass = {
    default: "text-foreground",
    critical: "text-destructive",
    warning: "text-amber-700 dark:text-amber-400",
    success: "text-emerald-700 dark:text-emerald-400",
  }[tone];
  return (
    <Card className="flex items-start gap-3 p-4">
      <div className={`grid h-10 w-10 place-items-center rounded-md ${accent}`}>
        <Icon icon={icon} size={20} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <span className={`mt-1 inline-block text-2xl font-semibold ${valueClass}`}>
          {value.toLocaleString("pt-BR")}
        </span>
      </div>
    </Card>
  );
}
