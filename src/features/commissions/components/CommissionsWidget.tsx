import { Link } from "@tanstack/react-router";
import type { ID } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { useCommissionMetrics } from "../hooks/useCommissionMetrics";
import { labelForPeriod, previousPeriod } from "../utils/periods";

const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const pctFmt = new Intl.NumberFormat("pt-BR", {
  style: "percent",
  maximumFractionDigits: 1,
});

interface IProps {
  storeId: ID;
  period?: string;
}

/**
 * Compact widget for the Executive Cockpit (PRD-040) and Manager Dashboard
 * (PRD-014). Shows total to pay this period, comparison vs previous and a
 * tally of statuses.
 */
export function CommissionsWidget({ storeId, period }: IProps) {
  const metrics = useCommissionMetrics({ storeId, period });

  if (metrics.isLoading) {
    return (
      <Card className="h-full p-4">
        <div className="h-32 animate-pulse rounded bg-muted/40" />
      </Card>
    );
  }

  const deltaPositive = metrics.previousDeltaPct >= 0;
  return (
    <Card className="h-full p-4">
      <header className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Comissões</h3>
          <p className="text-xs text-muted-foreground">{labelForPeriod(metrics.period)}</p>
        </div>
        <Link
          to="/app/gestao/comissoes"
          className="text-xs font-medium text-primary hover:underline"
        >
          Detalhes →
        </Link>
      </header>
      <div className="mt-3">
        <p className="text-2xl font-semibold text-foreground">
          {money.format(metrics.totals.total)}
        </p>
        {metrics.previousTotal > 0 && (
          <p
            className={`text-xs ${deltaPositive ? "text-success-foreground" : "text-destructive"}`}
          >
            <Icon
              icon={deltaPositive ? "mdi:trending-up" : "mdi:trending-down"}
              size={12}
              className="mr-1 inline align-text-bottom"
            />
            {deltaPositive ? "+" : ""}
            {pctFmt.format(metrics.previousDeltaPct)} vs{" "}
            {labelForPeriod(previousPeriod(metrics.period))}
          </p>
        )}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-1 text-xs">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Em apuração</dt>
          <dd className="font-medium text-foreground">{money.format(metrics.totals.calculated)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Pagas</dt>
          <dd className="font-medium text-foreground">{money.format(metrics.totals.paid)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Aprovadas</dt>
          <dd className="font-medium text-foreground">{money.format(metrics.totals.approved)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Em disputa</dt>
          <dd className="font-medium text-foreground">{money.format(metrics.totals.disputed)}</dd>
        </div>
      </dl>
    </Card>
  );
}
