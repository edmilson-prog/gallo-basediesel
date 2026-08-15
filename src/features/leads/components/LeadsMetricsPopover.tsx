import { useMemo } from "react";
import type { ILead } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { formatBRLCompact, formatPercent } from "@/shared/utils/format";
import { computeGlobalMetrics } from "../utils/leadMetrics";
import { LEADS_STRINGS } from "../i18n/pt-BR";

const COPY = LEADS_STRINGS.kanban.metrics;

export interface ILeadsMetricsPopoverProps {
  /**
   * The store's leads WITHOUT the converted/lost exclusions. Handing over the
   * filtered set is precisely the defect this component replaces: the old
   * metrics bar divided by converted leads the caller had already removed, so
   * it reported 0,0% permanently, in 52px of fixed vertical space.
   */
  leads: ILead[];
}

export function LeadsMetricsPopover({ leads }: ILeadsMetricsPopoverProps) {
  const metrics = useMemo(() => computeGlobalMetrics(leads), [leads]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="shrink-0 gap-1.5">
          <Icon icon="mdi:chart-box-outline" size={16} />
          <span className="hidden sm:inline">{COPY.trigger}</span>
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-72">
        <dl className="grid gap-3">
          <Metric
            icon="mdi:chart-line"
            label={COPY.conversion}
            value={formatPercent(metrics.conversionRate, 1)}
          />
          <Metric
            icon="mdi:clock-outline"
            label={COPY.avgCycle}
            value={`${metrics.averageCycleDays.toLocaleString("pt-BR", {
              maximumFractionDigits: 1,
            })} ${metrics.averageCycleDays === 1 ? "dia" : "dias"}`}
          />
          <Metric
            icon="mdi:cash-multiple"
            label={COPY.avgValue}
            value={metrics.averageValue > 0 ? formatBRLCompact(metrics.averageValue) : "—"}
          />
        </dl>

        <p className="mt-3 border-t border-border pt-2 text-[11px] leading-snug text-muted-foreground">
          {COPY.scopeNote} {COPY.periodNote}
        </p>
      </PopoverContent>
    </Popover>
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
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary/10 text-primary">
        <Icon icon={icon} size={14} aria-hidden />
      </span>
      <div className="min-w-0">
        <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</dt>
        <dd className="truncate text-lg font-semibold tabular-nums text-foreground">{value}</dd>
      </div>
    </div>
  );
}
