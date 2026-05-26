import type { ILead } from "@/shared/types";
import { useMemo } from "react";
import { Icon } from "@/components/Icon";
import { formatBRLCompact, formatPercent } from "@/shared/utils/format";
import { computeGlobalMetrics } from "../utils/leadMetrics";
import { LEADS_STRINGS } from "../i18n/pt-BR";

export interface IKanbanMetricsBarProps {
  leads: ILead[];
}

export function KanbanMetricsBar({ leads }: IKanbanMetricsBarProps) {
  const metrics = useMemo(() => computeGlobalMetrics(leads), [leads]);

  return (
    <div className="grid grid-cols-1 gap-3 border-b border-border bg-muted/30 px-4 py-2 sm:grid-cols-3">
      <Metric
        icon="mdi:chart-line"
        label={LEADS_STRINGS.kanban.metrics.conversion}
        value={formatPercent(metrics.conversionRate, 1)}
      />
      <Metric
        icon="mdi:clock-outline"
        label={LEADS_STRINGS.kanban.metrics.avgCycle}
        value={`${metrics.averageCycleDays.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${metrics.averageCycleDays === 1 ? "dia" : "dias"}`}
      />
      <Metric
        icon="mdi:cash-multiple"
        label={LEADS_STRINGS.kanban.metrics.avgValue}
        value={metrics.averageValue > 0 ? formatBRLCompact(metrics.averageValue) : "—"}
      />
    </div>
  );
}

interface IMetricProps {
  icon: string;
  label: string;
  value: string;
}

function Metric({ icon, label, value }: IMetricProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="grid h-7 w-7 place-items-center rounded-full bg-primary/10 text-primary">
        <Icon icon={icon} size={14} />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold text-foreground">{value}</p>
      </div>
    </div>
  );
}
