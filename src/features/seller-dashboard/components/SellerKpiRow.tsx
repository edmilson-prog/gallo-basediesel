import type { ICustomerServiceMetrics } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { formatBRL, formatPercent } from "@/shared/utils/format";
import { deltaPctOf } from "@/features/customer-service-analytics";
import { formatMinutesLabel } from "../engine/formatters";
import { SELLER_DASHBOARD_STRINGS as S } from "../i18n/pt-BR";

interface ISellerKpiRowProps {
  metrics: ICustomerServiceMetrics | null;
  salesCurrent: number;
  salesPrevious: number;
  isLoading: boolean;
  hasError: boolean;
  onRetry: () => void;
  /** Gated by `order:view` in the role matrix. */
  showSales: boolean;
  /** Gated by `conversation:view` in the role matrix. */
  showService: boolean;
}

export function SellerKpiRow({
  metrics,
  salesCurrent,
  salesPrevious,
  isLoading,
  hasError,
  onRetry,
  showSales,
  showService,
}: ISellerKpiRowProps) {
  if (hasError) {
    // Without this branch a failed fetch left `isLoading === false` and
    // `metrics === null`, pinning the row in skeletons forever with no error
    // text and no way to retry.
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card p-4">
        <p className="flex items-center gap-2 text-sm text-severity-critical">
          <Icon icon="mdi:alert-circle-outline" size={16} />
          {S.metricsError}
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
        >
          {S.retry}
        </button>
      </div>
    );
  }

  if (isLoading || !metrics) {
    return (
      <div className="grid grid-cols-1 divide-y divide-border rounded-xl border border-border bg-card sm:grid-cols-5 sm:divide-x sm:divide-y-0">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="p-4">
            <Skeleton className="mb-2 h-3 w-24" />
            <Skeleton className="h-7 w-16" />
          </div>
        ))}
      </div>
    );
  }

  const salesDeltaPct = deltaPctOf(salesCurrent, salesPrevious);
  const convDeltaPts =
    metrics.previous != null
      ? Math.round((metrics.totals.conversionRate - metrics.previous.conversionRate) * 100)
      : null;
  const atendDelta =
    metrics.previous != null
      ? metrics.totals.totalConversations - metrics.previous.totalConversations
      : null;

  type KpiItem = {
    icon: string;
    label: string;
    value: string;
    delta: string | null;
    good: boolean | null;
  };

  // Conversation-derived tiles need `conversation:view`; the revenue tile needs
  // `order:view`. Both come from the editable role matrix, so a seller whose
  // matrix lost one of them simply sees fewer tiles.
  const serviceItems: KpiItem[] = [
    {
      icon: "mdi:forum-outline",
      label: S.kpiConversations,
      value: String(metrics.totals.totalConversations),
      delta:
        atendDelta == null ? null : `${atendDelta >= 0 ? "+" : ""}${atendDelta} ${S.kpiVsPeriod}`,
      good: atendDelta == null ? null : atendDelta >= 0,
    },
    {
      icon: "mdi:timer-outline",
      label: S.kpiFirstResponse,
      value: formatMinutesLabel(metrics.totals.averageResponseTime),
      delta: S.kpiFirstResponseHint,
      good: null,
    },
    {
      icon: "mdi:progress-clock",
      label: S.kpiClosingTime,
      value: formatMinutesLabel(metrics.totals.averageHandleTime),
      delta: S.kpiClosingTimeHint,
      good: null,
    },
    {
      icon: "mdi:percent-outline",
      label: S.kpiConversion,
      value: formatPercent(metrics.totals.conversionRate),
      delta: convDeltaPts == null ? null : `${convDeltaPts >= 0 ? "+" : ""}${convDeltaPts} pts`,
      good: convDeltaPts == null ? null : convDeltaPts >= 0,
    },
  ];

  const salesItem: KpiItem = {
    icon: "mdi:cash-multiple",
    label: S.kpiSales,
    value: formatBRL(salesCurrent),
    delta: salesDeltaPct == null ? null : formatPercent(salesDeltaPct),
    good: salesDeltaPct == null ? null : salesDeltaPct >= 0,
  };

  const items: KpiItem[] = [
    ...(showService ? serviceItems : []),
    ...(showSales ? [salesItem] : []),
  ];

  if (items.length === 0) return null;

  // Static class strings so Tailwind's scanner keeps these in the build.
  const COLUMNS_BY_COUNT: Record<number, string> = {
    1: "sm:grid-cols-1",
    4: "sm:grid-cols-4",
    5: "sm:grid-cols-5",
  };

  return (
    <div
      className={cn(
        "grid grid-cols-1 divide-y divide-border rounded-xl border border-border bg-card sm:divide-x sm:divide-y-0",
        COLUMNS_BY_COUNT[items.length] ?? "sm:grid-cols-5",
      )}
    >
      {items.map((item) => (
        <div key={item.label} className="p-4">
          <div className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <Icon icon={item.icon} size={13} />
            {item.label}
          </div>
          <div className="font-display text-2xl font-bold text-foreground">{item.value}</div>
          {item.delta && (
            <div
              className={cn(
                "mt-1 text-xs",
                item.good === true
                  ? "text-severity-success"
                  : item.good === false
                    ? "text-severity-critical"
                    : "text-muted-foreground",
              )}
            >
              {item.delta}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
