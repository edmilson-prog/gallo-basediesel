import type { ICustomer } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { daysSince } from "@/shared/utils/format";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import type { IMonthlyPurchasePoint } from "../../utils/purchaseSeries";
import type { ICustomerCredit } from "../../engine/customerCredit";
import { CustomerCreditCell } from "./CustomerCreditCell";
import { CustomerSparkline } from "./CustomerSparkline";
import { CustomerKpi, buildCustomerKpiCells } from "./CustomerKpi";

const COPY = CUSTOMER_STRINGS.detail.commercial;

export interface ICustomerCommercialBandProps {
  customer: ICustomer;
  credit: ICustomerCredit | null;
  series: IMonthlyPurchasePoint[];
  hasPurchaseHistory: boolean;
  openQuotes: number;
  onCreateQuote: () => void;
}

/**
 * Band 3 — the commercial snapshot, in one row instead of three fixed-height
 * cards.
 *
 * When the customer has never bought, the chart does not become an empty
 * rectangle: it collapses into an invitation to create the first quote. That is
 * the whole reason this band exists as a band and not as a card grid.
 */
export function CustomerCommercialBand({
  customer,
  credit,
  series,
  hasPurchaseHistory,
  openQuotes,
  onCreateQuote,
}: ICustomerCommercialBandProps) {
  const contactAgeDays = daysSince(customer.createdAt) ?? 0;
  const kpis = buildCustomerKpiCells(customer, openQuotes);

  return (
    <div className="flex flex-wrap items-center gap-y-4 bg-muted/30 px-4 py-3 sm:px-6">
      {kpis.map((kpi, index) => (
        <div
          key={kpi.label}
          className={cn(
            "min-w-0 basis-1/2 pr-4 sm:basis-auto sm:pr-6",
            index > 0 && "sm:border-l sm:border-border sm:pl-6",
          )}
        >
          <CustomerKpi {...kpi} />
        </div>
      ))}

      <div className="min-w-0 basis-full border-border pr-4 sm:basis-auto sm:border-l sm:pl-6 sm:pr-6">
        <CustomerCreditCell customer={customer} credit={credit} />
      </div>

      <div className="basis-full border-border sm:ml-auto sm:basis-auto sm:border-l sm:pl-6">
        {hasPurchaseHistory ? (
          <div>
            <div className="mb-1 flex items-center justify-between gap-4">
              <span className="text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
                {COPY.evolution}
              </span>
              <span className="text-[10px] text-muted-foreground/70">{COPY.evolutionWindow}</span>
            </div>
            <CustomerSparkline series={series} />
          </div>
        ) : (
          <div className="flex max-w-[280px] items-center gap-2.5">
            <Icon
              icon="mdi:chart-timeline-variant"
              size={18}
              className="shrink-0 text-muted-foreground/60"
            />
            <div className="min-w-0">
              <div className="text-[12.5px] font-semibold text-foreground">{COPY.noHistory}</div>
              <div className="text-[11px] text-muted-foreground">
                {COPY.noHistoryHint(contactAgeDays)}
              </div>
              <button
                type="button"
                onClick={onCreateQuote}
                className="mt-0.5 inline-flex items-center gap-1 rounded text-[11.5px] font-semibold text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {COPY.firstQuoteCta}
                <Icon icon="mdi:arrow-right" size={12} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
