import type { ICashFlowSummary } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/shared/utils/format";
import { CASHFLOW_STRINGS as S } from "../i18n/pt-BR";

function KpiCard({
  label,
  help,
  value,
  icon,
  tone,
}: {
  label: string;
  help?: string;
  value: number;
  icon: string;
  tone?: "success" | "destructive" | "default";
}) {
  const toneClass =
    tone === "success"
      ? "text-success"
      : tone === "destructive"
        ? "text-destructive"
        : value < 0
          ? "text-destructive"
          : "text-foreground";
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Icon icon={icon} size={16} className={toneClass} />
      </div>
      <p className={cn("mt-2 text-2xl font-semibold tabular-nums", toneClass)}>
        {formatBRL(value)}
      </p>
      {help && <p className="mt-1 text-[11px] text-muted-foreground">{help}</p>}
    </Card>
  );
}

export function CashFlowKpis({ summary }: { summary: ICashFlowSummary }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        label={S.kpiCurrentBalance}
        value={summary.closingBalance}
        icon="mdi:wallet-outline"
      />
      <KpiCard
        label={S.kpiInflows}
        value={summary.totalInflows}
        icon="mdi:arrow-down-circle-outline"
        tone="success"
      />
      <KpiCard
        label={S.kpiOutflows}
        value={summary.totalOutflows}
        icon="mdi:arrow-up-circle-outline"
        tone="destructive"
      />
      <KpiCard
        label={S.kpiProjectedBalance}
        help={S.kpiProjectedHelp}
        value={summary.projectedClosingBalance}
        icon="mdi:chart-timeline-variant"
      />
    </div>
  );
}
