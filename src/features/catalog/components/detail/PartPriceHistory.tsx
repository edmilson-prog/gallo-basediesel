import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IAuditLog, IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { formatBRL, formatDateTimeBR } from "@/shared/utils/format";
import { useAuditsProvider } from "@/providers/data/hooks/useAuditsProvider";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";

interface IPriceChangeBeforeAfter {
  before?: { unitPrice?: number };
  after?: { unitPrice?: number };
}

export interface IPartPriceHistoryProps {
  part: IPart;
}

/** Collapsible price-change history. Lazy-loads audits on first expand. */
export function PartPriceHistory({ part }: IPartPriceHistoryProps) {
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

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <Icon icon={expanded ? "mdi:chevron-up" : "mdi:chevron-down"} size={14} />
        {CATALOG_STRINGS.detail.sections.priceHistory}
      </button>

      {expanded && (
        <div className="mt-3 rounded-md border border-border bg-muted/30 p-3">
          {audits.isLoading ? (
            <p className="text-xs text-muted-foreground">Carregando…</p>
          ) : priceChanges.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              {CATALOG_STRINGS.detail.priceHistory.empty}
            </p>
          ) : (
            <ul className="space-y-1.5 text-xs">
              {priceChanges.map((entry) => {
                const ba = entry as IAuditLog & IPriceChangeBeforeAfter;
                const before = ba.before?.unitPrice;
                const after = ba.after?.unitPrice;
                const diff =
                  before !== undefined && after !== undefined
                    ? ((after - before) / before) * 100
                    : undefined;
                return (
                  <li key={entry.id} className="flex items-center justify-between">
                    <span className="text-muted-foreground">
                      {formatDateTimeBR(entry.timestamp)}
                    </span>
                    <span className="font-mono tabular-nums">
                      {before !== undefined ? formatBRL(before) : "?"} →{" "}
                      {after !== undefined ? formatBRL(after) : "?"}
                      {diff !== undefined && (
                        <span
                          className={
                            diff < 0
                              ? " ml-2 text-emerald-600 dark:text-emerald-400"
                              : " ml-2 text-amber-600 dark:text-amber-400"
                          }
                        >
                          {diff > 0 ? "+" : ""}
                          {diff.toFixed(1)}%
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
