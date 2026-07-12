import type { ICustomer } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import { ABC_BADGE_CLASSES } from "../../utils/customerDisplay";
import { resolveAbc, resolveLastPurchaseAt, resolvePurchaseStats } from "../../utils/dintecStats";
import { DintecSourceBadge } from "../DintecSourceBadge";
import { daysSince, formatBRL, formatPercent } from "@/shared/utils/format";

const COPY = CUSTOMER_STRINGS.overview.metrics;

export interface IMetricsCardProps {
  customer: ICustomer;
}

/**
 * Snapshot of the BI fields needed in the first seconds of every conversation:
 * ticket médio, LTV, recência, frequência, classe ABC. Falls back field-by-field
 * to the DINTEC ERP snapshot (marked with an "ERP" badge) when the customer has
 * no orders in the platform yet — see `dintecStats.ts`.
 */
export function MetricsCard({ customer }: IMetricsCardProps) {
  const stats = resolvePurchaseStats(customer);
  const recency = resolveLastPurchaseAt(customer);
  const recencyDays = recency ? daysSince(recency.value) : null;
  const abc = resolveAbc(customer);

  const recencyLabel =
    recencyDays === null
      ? COPY.recencyNever
      : recencyDays === 0
        ? COPY.recencyToday
        : COPY.recencyDays(recencyDays);

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
          value={stats.ticketMedio ? formatBRL(stats.ticketMedio.value) : "—"}
          hint={COPY.ticketMedioHint}
          fromDintec={stats.ticketMedio?.fromDintec ?? false}
        />
        <Metric
          icon="mdi:trophy-outline"
          label={COPY.ltv}
          value={stats.ltv ? formatBRL(stats.ltv.value) : "—"}
          hint={COPY.ltvHint}
          fromDintec={stats.ltv?.fromDintec ?? false}
        />
        <Metric
          icon="mdi:calendar-clock"
          label={COPY.recency}
          value={recencyLabel}
          fromDintec={recency?.fromDintec ?? false}
        />
        <Metric
          icon="mdi:repeat-variant"
          label={COPY.frequency}
          value={
            stats.frequencia
              ? stats.frequencia.fromDintec
                ? COPY.frequencyValueErp(stats.frequencia.value)
                : COPY.frequencyValue(stats.frequencia.value)
              : "—"
          }
          fromDintec={stats.frequencia?.fromDintec ?? false}
        />
      </dl>

      <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Icon icon="mdi:tag-multiple-outline" size={14} />
          <span className="font-medium uppercase tracking-wide">{COPY.abc}</span>
        </div>
        {abc ? (
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "inline-flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold",
                ABC_BADGE_CLASSES[abc.abcClass],
              )}
            >
              {abc.abcClass}
            </span>
            {typeof abc.abcShare === "number" && (
              <span className="text-xs text-muted-foreground">
                {COPY.abcShareHint(formatPercent(abc.abcShare))}
              </span>
            )}
            {abc.fromDintec && <DintecSourceBadge />}
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
  fromDintec: boolean;
}

function Metric({ icon, label, value, hint, fromDintec }: IMetricProps) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-[11px] uppercase tracking-wide text-muted-foreground">
        <Icon icon={icon} size={11} />
        {label}
      </dt>
      <dd className="mt-0.5 flex items-center gap-1.5 truncate text-sm font-semibold text-foreground" title={value}>
        {value}
        {fromDintec && <DintecSourceBadge />}
      </dd>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
