import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/shared/utils/format";
import { EXPENSES_STRINGS as S } from "../i18n/pt-BR";
import type { IExpensesKpis } from "../hooks/useExpensesData";

interface IKpiCardProps {
  label: string;
  help?: string;
  value: number;
  icon: string;
  tone?: "default" | "success" | "warning" | "destructive";
}

const TONE_CLASSES: Record<NonNullable<IKpiCardProps["tone"]>, string> = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  destructive: "text-destructive",
};

function KpiCard({ label, help, value, icon, tone = "default" }: IKpiCardProps) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <Icon icon={icon} size={16} className={TONE_CLASSES[tone]} />
      </div>
      <p className={cn("mt-2 text-2xl font-semibold tabular-nums", TONE_CLASSES[tone])}>
        {formatBRL(value)}
      </p>
      {help && <p className="mt-1 text-[11px] text-muted-foreground">{help}</p>}
    </Card>
  );
}

export function ExpenseKpis({ kpis }: { kpis: IExpensesKpis }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        label={S.kpiTotal}
        help={S.kpiTotalHelp}
        value={kpis.total}
        icon="mdi:cash-multiple"
      />
      <KpiCard label={S.kpiPaid} value={kpis.paid} icon="mdi:check-circle-outline" tone="success" />
      <KpiCard label={S.kpiPending} value={kpis.pending} icon="mdi:clock-outline" tone="warning" />
      <KpiCard
        label={S.kpiOverdue}
        value={kpis.overdue}
        icon="mdi:alert-circle-outline"
        tone="destructive"
      />
    </div>
  );
}
