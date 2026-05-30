import type { ICustomer } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { daysSince, formatBRL, formatPercent } from "@/shared/utils/format";
import { ABC_BADGE_CLASSES } from "../../utils/customerDisplay";
import { cn } from "@/lib/utils";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";

const COPY = CUSTOMER_STRINGS.detail.statStrip;

export interface ICustomerStatStripProps {
  customer: ICustomer;
}

interface IStatCell {
  icon: string;
  label: string;
  value: React.ReactNode;
}

/**
 * Full-width KPI strip rendered between the page header and the analytics hero.
 * Mirrors the vehicle detail "stat strip" pattern: hairline cells via gap-px on
 * a bg-border parent with bg-card cells. Read-only snapshot of purchaseStats.
 */
export function CustomerStatStrip({ customer }: ICustomerStatStripProps) {
  const stats = customer.purchaseStats;
  const recency = customer.lastPurchaseAt ? daysSince(customer.lastPurchaseAt) : null;

  const cells: IStatCell[] = [
    {
      icon: "mdi:cash-multiple",
      label: COPY.ticketMedio,
      value: stats ? formatBRL(stats.ticketMedio) : COPY.empty,
    },
    {
      icon: "mdi:trophy-outline",
      label: COPY.ltv,
      value: stats ? formatBRL(stats.ltv) : COPY.empty,
    },
    {
      icon: "mdi:calendar-clock",
      label: COPY.recency,
      value: recency === null ? COPY.recencyNever : COPY.recencyDays(recency),
    },
    {
      icon: "mdi:repeat-variant",
      label: COPY.frequency,
      value: stats ? COPY.frequencyValue(stats.orderCount12m) : COPY.empty,
    },
    {
      icon: "mdi:tag-multiple-outline",
      label: COPY.abc,
      value: customer.abcClass ? (
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold",
              ABC_BADGE_CLASSES[customer.abcClass],
            )}
          >
            {customer.abcClass}
          </span>
          {typeof customer.abcShare === "number" && (
            <span className="text-xs text-muted-foreground">
              {COPY.abcShare(formatPercent(customer.abcShare))}
            </span>
          )}
        </span>
      ) : (
        COPY.empty
      ),
    },
  ];

  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-border sm:grid-cols-3 lg:grid-cols-5">
      {cells.map((cell) => (
        <div key={cell.label} className="bg-card px-4 py-3">
          <dt className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
            <Icon icon={cell.icon} size={11} />
            {cell.label}
          </dt>
          <dd className="mt-1 text-sm font-semibold tabular-nums text-foreground">{cell.value}</dd>
        </div>
      ))}
    </dl>
  );
}
