import type { ICustomer } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { daysSince, formatBRL } from "@/shared/utils/format";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import { resolveLastPurchaseAt, resolvePurchaseStats } from "../../utils/dintecStats";
import type { IMonthlyPurchasePoint } from "../../utils/purchaseSeries";
import type { ICustomerCredit } from "../../engine/customerCredit";
import { DintecSourceBadge } from "../DintecSourceBadge";
import { CustomerCreditCell } from "./CustomerCreditCell";
import { CustomerSparkline } from "./CustomerSparkline";

const COPY = CUSTOMER_STRINGS.detail.commercial;

interface IKpi {
  label: string;
  value: string | null;
  hint: string;
  fromDintec?: boolean;
  emphasis?: boolean;
}

function Kpi({ label, value, hint, fromDintec, emphasis }: IKpi) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span
          className={cn(
            "text-lg font-semibold leading-none tabular-nums",
            value == null
              ? "text-muted-foreground/60"
              : emphasis
                ? "text-primary"
                : "text-foreground",
          )}
        >
          {value ?? COPY.empty}
        </span>
        {fromDintec && value != null && <DintecSourceBadge />}
      </div>
      <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</div>
    </div>
  );
}

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
  const stats = resolvePurchaseStats(customer);
  const lastPurchase = resolveLastPurchaseAt(customer);
  const lastPurchaseDays = lastPurchase ? daysSince(lastPurchase.value) : null;
  const contactAgeDays = daysSince(customer.createdAt) ?? 0;

  const kpis: IKpi[] = [
    {
      label: COPY.ticketMedio,
      value: stats.ticketMedio ? formatBRL(stats.ticketMedio.value) : null,
      hint: COPY.ticketHint,
      fromDintec: stats.ticketMedio?.fromDintec,
    },
    {
      label: COPY.ltv,
      value: stats.ltv ? formatBRL(stats.ltv.value) : null,
      hint: COPY.ltvHint,
      fromDintec: stats.ltv?.fromDintec,
    },
    {
      label: COPY.lastPurchase,
      value: lastPurchaseDays !== null ? COPY.lastPurchaseDays(lastPurchaseDays) : null,
      hint: lastPurchaseDays !== null ? "" : COPY.neverPurchased,
      fromDintec: lastPurchase?.fromDintec,
    },
    {
      label: COPY.frequency,
      value: stats.frequencia ? String(stats.frequencia.value) : null,
      // The DINTEC figure is an all-time invoice count, never a 12-month window
      // — labeling both the same way would be a lie (see ICustomerBase docs).
      hint: stats.frequencia?.fromDintec ? COPY.frequencyHintErp : COPY.frequencyHint,
      fromDintec: stats.frequencia?.fromDintec,
    },
    {
      label: COPY.openQuotes,
      value: openQuotes > 0 ? String(openQuotes) : null,
      hint: openQuotes > 0 ? COPY.openQuotesHint : COPY.openQuotesNone,
      emphasis: openQuotes > 0,
    },
  ];

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
          <Kpi {...kpi} />
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
