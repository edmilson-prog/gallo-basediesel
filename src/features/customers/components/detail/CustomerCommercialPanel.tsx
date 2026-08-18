import type { ICustomer } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { daysSince, formatDateBR } from "@/shared/utils/format";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import type { IMonthlyPurchasePoint } from "../../utils/purchaseSeries";
import type { ICustomerCredit } from "../../engine/customerCredit";
import { CustomerCreditCell } from "./CustomerCreditCell";
import { CustomerSparkline } from "./CustomerSparkline";
import { CustomerKpi, buildCustomerKpiCells } from "./CustomerKpi";

const COPY = CUSTOMER_STRINGS.detail.commercial;

export interface ICustomerCommercialPanelProps {
  customer: ICustomer;
  credit: ICustomerCredit | null;
  series: IMonthlyPurchasePoint[];
  hasPurchaseHistory: boolean;
  openQuotes: number;
  onCreateQuote: () => void;
}

/**
 * Direction B's right-hand column — the same commercial facts as the band of
 * direction A, stacked instead of laid out in a row: chart on top, the five
 * KPIs in a 3-column grid, credit at the foot.
 *
 * Without purchase history the chart slot keeps its frame but changes what it
 * says, so the panel never shows an empty rectangle where a trend should be.
 */
export function CustomerCommercialPanel({
  customer,
  credit,
  series,
  hasPurchaseHistory,
  openQuotes,
  onCreateQuote,
}: ICustomerCommercialPanelProps) {
  const kpis = buildCustomerKpiCells(customer, openQuotes);
  const contactAgeDays = daysSince(customer.createdAt) ?? 0;
  const since = customer.firstPurchaseAt ?? customer.createdAt;

  return (
    <div className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-2.5">
        <span className="font-display text-sm font-bold uppercase tracking-[0.05em] text-muted-foreground">
          {COPY.panelTitle}
        </span>
        {since && (
          <span className="text-[10.5px] text-muted-foreground/70">
            {COPY.customerSince(formatDateBR(since))}
          </span>
        )}
      </div>

      <div className="mb-3 rounded-lg border border-border bg-muted/40 px-3 py-2.5">
        {hasPurchaseHistory ? (
          <>
            <div className="mb-1 flex items-center justify-between gap-4">
              <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
                {COPY.evolution}
              </span>
              <span className="text-[10px] text-muted-foreground/70">{COPY.evolutionWindow}</span>
            </div>
            <CustomerSparkline series={series} width={330} height={40} />
          </>
        ) : (
          <div className="flex items-center gap-2.5">
            <Icon
              icon="mdi:chart-timeline-variant"
              size={18}
              className="shrink-0 text-muted-foreground/60"
            />
            <div className="min-w-0 flex-1">
              <div className="text-[12.5px] font-semibold text-foreground">{COPY.noHistory}</div>
              <div className="text-[11.5px] text-muted-foreground/70">
                {COPY.noHistoryHint(contactAgeDays)}
              </div>
            </div>
            <Button variant="secondary" size="sm" className="shrink-0" onClick={onCreateQuote}>
              {COPY.firstQuoteButton}
            </Button>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3.5 sm:grid-cols-3">
        {kpis.map((kpi) => (
          <CustomerKpi key={kpi.label} {...kpi} />
        ))}
      </div>

      <div className="mt-3.5 border-t border-border pt-3">
        <CustomerCreditCell customer={customer} credit={credit} />
      </div>
    </div>
  );
}
