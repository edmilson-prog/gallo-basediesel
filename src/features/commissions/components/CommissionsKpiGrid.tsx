import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { COMMISSIONS_STRINGS as S } from "../i18n/pt-BR";

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const pctFmt = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});

interface ICommissionsKpiGridProps {
  totals: {
    orderCount: number;
    baseCommission: number;
    goalBonus: number;
    total: number;
    paid: number;
    approved: number;
    calculated: number;
    disputed: number;
  };
  previousTotal: number;
  previousDeltaPct: number;
  previousLabel: string;
}

export function CommissionsKpiGrid({
  totals,
  previousTotal,
  previousDeltaPct,
  previousLabel,
}: ICommissionsKpiGridProps) {
  const delta = previousDeltaPct;
  const deltaPositive = delta >= 0;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Kpi
        icon="mdi:cash-multiple"
        accent="primary"
        label={S.kpiTotalToPay}
        value={money.format(totals.total)}
        hint={
          previousTotal > 0
            ? `${deltaPositive ? "+" : ""}${pctFmt.format(delta)} ${S.kpiPreviousDelta}`
            : `${previousLabel}: ${money.format(previousTotal)}`
        }
      />
      <Kpi
        icon="mdi:receipt-text-outline"
        accent="info"
        label={S.kpiOrderCount}
        value={String(totals.orderCount)}
        hint={`Base: ${money.format(totals.baseCommission)}`}
      />
      <Kpi
        icon="mdi:trophy-outline"
        accent="success"
        label={S.kpiGoalBonus}
        value={money.format(totals.goalBonus)}
        hint={
          totals.goalBonus > 0 ? "Pelo menos uma meta atingida" : "Sem bônus por meta neste período"
        }
      />
      <Kpi
        icon="mdi:flag-checkered"
        accent={totals.disputed > 0 ? "warning" : "muted"}
        label="Status"
        value={`${money.format(totals.paid + totals.approved)} fechados`}
        hint={`${S.kpiStatusCalculated}: ${money.format(totals.calculated)} · ${S.kpiStatusDisputed}: ${money.format(
          totals.disputed,
        )}`}
      />
    </div>
  );
}

interface IKpiProps {
  icon: string;
  label: string;
  value: string;
  hint?: string;
  accent: "primary" | "info" | "success" | "warning" | "muted";
}

function Kpi({ icon, label, value, hint, accent }: IKpiProps) {
  const accentClass =
    accent === "primary"
      ? "bg-primary/10 text-primary"
      : accent === "info"
        ? "bg-info/10 text-info"
        : accent === "success"
          ? "bg-success/10 text-success-foreground"
          : accent === "warning"
            ? "bg-warning/10 text-warning-foreground"
            : "bg-muted text-muted-foreground";
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <span className={`flex h-10 w-10 items-center justify-center rounded-md ${accentClass}`}>
          <Icon icon={icon} size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-0.5 truncate text-lg font-semibold text-foreground">{value}</p>
          {hint && <p className="mt-1 truncate text-xs text-muted-foreground">{hint}</p>}
        </div>
      </div>
    </Card>
  );
}
