import type { ICustomer } from "@/shared/types";
import { cn } from "@/lib/utils";
import { daysSince, formatBRL, formatDateBR } from "@/shared/utils/format";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import { resolveLastPurchaseAt, resolvePurchaseStats } from "../../utils/dintecStats";
import { DintecSourceBadge } from "../DintecSourceBadge";

const COPY = CUSTOMER_STRINGS.detail.commercial;

export interface ICustomerKpiCell {
  label: string;
  value: string | null;
  hint: string;
  fromDintec?: boolean;
  emphasis?: boolean;
}

/**
 * The five commercial KPIs, identical in both header directions — the kit keeps
 * them in one `crmKpiCells` for exactly this reason: A and B differ in
 * arrangement, never in what they report.
 */
export function buildCustomerKpiCells(customer: ICustomer, openQuotes: number): ICustomerKpiCell[] {
  const stats = resolvePurchaseStats(customer);
  const lastPurchase = resolveLastPurchaseAt(customer);
  const lastPurchaseDays = lastPurchase ? daysSince(lastPurchase.value) : null;

  return [
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
      // The date is the value and the recency is the hint, like the kit: "when"
      // is what a seller reads out loud, "há N dias" is what they judge it by.
      label: COPY.lastPurchase,
      value: lastPurchase ? formatDateBR(lastPurchase.value) : null,
      hint:
        lastPurchaseDays !== null ? COPY.lastPurchaseDays(lastPurchaseDays) : COPY.neverPurchased,
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
}

/** Label in micro-caps, figure in the display face, hint below. */
export function CustomerKpi({ label, value, hint, fromDintec, emphasis }: ICustomerKpiCell) {
  return (
    <div className="min-w-0">
      <div className="truncate text-[9.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span
          className={cn(
            "font-display text-xl font-bold leading-none tabular-nums tracking-[0.005em]",
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
