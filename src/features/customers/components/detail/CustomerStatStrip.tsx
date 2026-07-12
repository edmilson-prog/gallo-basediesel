import type { ICustomer } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { daysSince, formatBRL, formatPercent } from "@/shared/utils/format";
import { ABC_BADGE_CLASSES } from "../../utils/customerDisplay";
import { resolveAbc, resolveLastPurchaseAt, resolvePurchaseStats } from "../../utils/dintecStats";
import { DintecSourceBadge } from "../DintecSourceBadge";
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
 * a bg-border parent with bg-card cells. Read-only snapshot of purchaseStats,
 * falling back field-by-field to the DINTEC ERP snapshot (with an "ERP" badge)
 * when the platform has no live-computed value yet — see `dintecStats.ts`.
 */
export function CustomerStatStrip({ customer }: ICustomerStatStripProps) {
  const stats = resolvePurchaseStats(customer);
  const recency = resolveLastPurchaseAt(customer);
  const recencyDays = recency ? daysSince(recency.value) : null;
  const abc = resolveAbc(customer);

  const cells: IStatCell[] = [
    {
      icon: "mdi:cash-multiple",
      label: COPY.ticketMedio,
      value: stats.ticketMedio ? (
        <StatValue text={formatBRL(stats.ticketMedio.value)} fromDintec={stats.ticketMedio.fromDintec} />
      ) : (
        COPY.empty
      ),
    },
    {
      icon: "mdi:trophy-outline",
      label: COPY.ltv,
      value: stats.ltv ? (
        <StatValue text={formatBRL(stats.ltv.value)} fromDintec={stats.ltv.fromDintec} />
      ) : (
        COPY.empty
      ),
    },
    {
      icon: "mdi:calendar-clock",
      label: COPY.recency,
      value:
        recencyDays === null ? (
          COPY.recencyNever
        ) : (
          <StatValue text={COPY.recencyDays(recencyDays)} fromDintec={recency!.fromDintec} />
        ),
    },
    {
      icon: "mdi:repeat-variant",
      label: COPY.frequency,
      value: stats.frequencia ? (
        <StatValue
          text={
            stats.frequencia.fromDintec
              ? COPY.frequencyValueErp(stats.frequencia.value)
              : COPY.frequencyValue(stats.frequencia.value)
          }
          fromDintec={stats.frequencia.fromDintec}
        />
      ) : (
        COPY.empty
      ),
    },
    {
      icon: "mdi:tag-multiple-outline",
      label: COPY.abc,
      value: abc ? (
        <span className="flex items-center gap-1.5">
          <span
            className={cn(
              "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold",
              ABC_BADGE_CLASSES[abc.abcClass],
            )}
          >
            {abc.abcClass}
          </span>
          {typeof abc.abcShare === "number" && (
            <span className="text-xs text-muted-foreground">
              {COPY.abcShare(formatPercent(abc.abcShare))}
            </span>
          )}
          {abc.fromDintec && <DintecSourceBadge />}
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

function StatValue({ text, fromDintec }: { text: string; fromDintec: boolean }) {
  if (!fromDintec) return <>{text}</>;
  return (
    <span className="flex items-center gap-1.5">
      {text}
      <DintecSourceBadge />
    </span>
  );
}
