import { KpiCard } from "@/features/manager-dashboard/components/KpiCard";
import { formatBRL, formatBRLCompact } from "@/shared/utils/format";
import { SALES_ANALYTICS_STRINGS as S } from "../i18n/pt-BR";
import type { ISalesKpis } from "../hooks/useSalesAnalytics";

export interface ISalesKpiRowProps {
  kpis: ISalesKpis;
  isLoading?: boolean;
}

export function SalesKpiRow({ kpis, isLoading = false }: ISalesKpiRowProps) {
  return (
    <section
      aria-label="Indicadores principais"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
    >
      <KpiCard
        label={S.kpiRevenue}
        shortLabel={S.kpiRevenueShort}
        icon="mdi:cash-multiple"
        value={kpis.revenue.current}
        formatValue={(v) => formatBRLCompact(v)}
        helpText={S.kpiRevenueHelp}
        trend={kpis.revenue.trend}
        isLoading={isLoading}
      />
      <KpiCard
        label={S.kpiOrders}
        shortLabel={S.kpiOrdersShort}
        icon="mdi:package-variant-closed"
        value={kpis.orderCount.current}
        helpText={S.kpiOrdersHelp}
        trend={kpis.orderCount.trend}
        isLoading={isLoading}
      />
      <KpiCard
        label={S.kpiAvgTicket}
        shortLabel={S.kpiAvgTicketShort}
        icon="mdi:cart-outline"
        value={kpis.avgTicket.current}
        formatValue={(v) => formatBRL(v)}
        helpText={S.kpiAvgTicketHelp}
        trend={kpis.avgTicket.trend}
        isLoading={isLoading}
      />
      <KpiCard
        label={S.kpiMargin}
        shortLabel={S.kpiMarginShort}
        icon="mdi:chart-pie"
        value={kpis.marginPct.current}
        formatValue={(v) =>
          `${v.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
        }
        helpText={S.kpiMarginHelp}
        trend={kpis.marginPct.trend}
        isLoading={isLoading}
      />
    </section>
  );
}
