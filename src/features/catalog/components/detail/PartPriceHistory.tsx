import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IAuditLog, IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL, formatDateTimeBR } from "@/shared/utils/format";
import { useAuditsProvider } from "@/providers/data/hooks/useAuditsProvider";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";

const COPY = CATALOG_STRINGS.detail.priceHistory;

interface IPriceChangeBeforeAfter {
  before?: { unitPrice?: number };
  after?: { unitPrice?: number };
}

export interface IPartPriceHistoryProps {
  part: IPart;
  /**
   * `inline` is the disclosure link used inside the pricing card; `panel` is the
   * standalone collapsible card from the design kit (`CatPriceHistory`).
   */
  variant?: "inline" | "panel";
}

/** Collapsible price-change history. Lazy-loads audits on first expand. */
export function PartPriceHistory({ part, variant = "inline" }: IPartPriceHistoryProps) {
  const [expanded, setExpanded] = useState(false);
  const auditsProvider = useAuditsProvider();
  const audits = useQuery({
    queryKey: ["part-price-history", part.id] as const,
    queryFn: () =>
      auditsProvider.list({
        resource: "part",
        resourceId: part.id,
        action: "part_price_change",
        pageSize: 10,
      }),
    staleTime: 60_000,
    enabled: expanded,
  });

  const priceChanges = (audits.data?.data ?? []) as IAuditLog[];
  const isPanel = variant === "panel";

  const body = audits.isLoading ? (
    <p className="text-xs text-muted-foreground">{COPY.loading}</p>
  ) : priceChanges.length === 0 ? (
    <p className="text-xs text-muted-foreground">{COPY.empty}</p>
  ) : (
    <ul className={cn(isPanel ? "space-y-3.5" : "space-y-1.5 text-xs")}>
      {priceChanges.map((entry) => {
        const ba = entry as IAuditLog & IPriceChangeBeforeAfter;
        const before = ba.before?.unitPrice;
        const after = ba.after?.unitPrice;
        const diff =
          before !== undefined && after !== undefined
            ? ((after - before) / before) * 100
            : undefined;
        const raised = diff !== undefined && diff > 0;

        if (isPanel) {
          return (
            <li key={entry.id} className="flex items-start gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted">
                <Icon
                  icon={raised ? "mdi:trending-up" : "mdi:trending-down"}
                  size={14}
                  className={raised ? "text-severity-warning" : "text-severity-success"}
                />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold tabular-nums text-foreground">
                  {before !== undefined ? formatBRL(before) : "?"} →{" "}
                  {after !== undefined ? formatBRL(after) : "?"}
                  {diff !== undefined && (
                    <span
                      className={cn(
                        "ml-2 text-xs font-bold",
                        raised ? "text-severity-warning" : "text-severity-success",
                      )}
                    >
                      {raised ? "+" : ""}
                      {diff.toFixed(1)}%
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">{formatDateTimeBR(entry.timestamp)}</p>
              </div>
            </li>
          );
        }

        return (
          <li key={entry.id} className="flex items-center justify-between">
            <span className="text-muted-foreground">{formatDateTimeBR(entry.timestamp)}</span>
            <span className="font-mono tabular-nums">
              {before !== undefined ? formatBRL(before) : "?"} →{" "}
              {after !== undefined ? formatBRL(after) : "?"}
              {diff !== undefined && (
                <span
                  className={raised ? " ml-2 text-severity-warning" : " ml-2 text-severity-success"}
                >
                  {raised ? "+" : ""}
                  {diff.toFixed(1)}%
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ul>
  );

  if (isPanel) {
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex w-full cursor-pointer items-center gap-2.5 px-[18px] py-3.5 text-left transition-colors hover:bg-muted/40"
        >
          <Icon icon="mdi:history" size={15} className="text-muted-foreground" />
          <span className="text-[13.5px] font-bold text-foreground">{COPY.title}</span>
          <Icon
            icon={expanded ? "mdi:chevron-up" : "mdi:chevron-down"}
            size={16}
            className="ml-auto text-muted-foreground"
          />
        </button>
        {expanded && <div className="px-[18px] pb-4 pt-0.5">{body}</div>}
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Icon icon={expanded ? "mdi:chevron-up" : "mdi:chevron-down"} size={14} />
        {CATALOG_STRINGS.detail.sections.priceHistory}
      </button>

      {expanded && (
        <div className="mt-3 rounded-md border border-border bg-muted/30 p-3">{body}</div>
      )}
    </div>
  );
}
