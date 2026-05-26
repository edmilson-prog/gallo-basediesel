import type { ICustomer } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import { ABC_BADGE_CLASSES } from "../../utils/customerDisplay";
import { daysSince, formatBRL, formatPercent } from "@/shared/utils/format";

const COPY = CUSTOMER_STRINGS.overview.metrics;

export interface IMetricsCardProps {
  customer: ICustomer;
}

/**
 * Snapshot of the BI fields needed in the first seconds of every conversation:
 * ticket médio, LTV, recência, frequência, classe ABC. Falls back to neutral
 * placeholders when the customer has no orders yet (purchaseStats undefined).
 */
export function MetricsCard({ customer }: IMetricsCardProps) {
  const stats = customer.purchaseStats;
  const recency = customer.lastPurchaseAt ? daysSince(customer.lastPurchaseAt) : null;

  const recencyLabel =
    recency === null
      ? COPY.recencyNever
      : recency === 0
        ? COPY.recencyToday
        : COPY.recencyDays(recency);

  return (
    <section className="rounded-lg border border-border bg-background p-3">
      <header className="mb-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon icon="mdi:chart-line" size={14} />
        {COPY.title}
      </header>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-3">
        <Metric
          icon="mdi:cash-multiple"
          label={COPY.ticketMedio}
          value={stats ? formatBRL(stats.ticketMedio) : "—"}
          hint={COPY.ticketMedioHint}
        />
        <Metric
          icon="mdi:trophy-outline"
          label={COPY.ltv}
          value={stats ? formatBRL(stats.ltv) : "—"}
          hint={COPY.ltvHint}
        />
        <Metric icon="mdi:calendar-clock" label={COPY.recency} value={recencyLabel} />
        <Metric
          icon="mdi:repeat-variant"
          label={COPY.frequency}
          value={stats ? COPY.frequencyValue(stats.orderCount12m) : "—"}
        />
      </dl>

      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon icon="mdi:tag-multiple-outline" size={14} />
          <span className="font-medium uppercase tracking-wide">{COPY.abc}</span>
        </div>
        {customer.abcClass ? (
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                ABC_BADGE_CLASSES[customer.abcClass],
              )}
            >
              {customer.abcClass}
            </span>
            {typeof customer.abcShare === "number" && (
              <span className="text-xs text-muted-foreground">
                {COPY.abcShareHint(formatPercent(customer.abcShare))}
              </span>
            )}
          </div>
        ) : (
          <span className="text-xs italic text-muted-foreground">{COPY.noOrders}</span>
        )}
      </div>
    </section>
  );
}

interface IMetricProps {
  icon: string;
  label: string;
  value: string;
  hint?: string;
}

function Metric({ icon, label, value, hint }: IMetricProps) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Icon icon={icon} size={11} />
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-sm font-semibold text-foreground" title={value}>
        {value}
      </dd>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
