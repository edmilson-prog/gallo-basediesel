import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { IAuditLog, IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { useAuditsProvider } from "@/providers/data/hooks/useAuditsProvider";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import { Section } from "./ApplicationsSection";

function formatPrice(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

interface IPriceChangeBeforeAfter {
  before?: { unitPrice?: number };
  after?: { unitPrice?: number };
}

export interface ICommercialSectionProps {
  part: IPart;
}

export function CommercialSection({ part }: ICommercialSectionProps) {
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
    <Section title={CATALOG_STRINGS.detail.sections.commercial} icon="mdi:cash-multiple">
      <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
        <Stat
          label={CATALOG_STRINGS.detail.commercial.price}
          value={formatPrice(part.unitPrice)}
          highlight
        />
        <Stat label={CATALOG_STRINGS.detail.commercial.cost} value={formatPrice(part.unitCost)} />
        <Stat
          label={CATALOG_STRINGS.detail.commercial.margin}
          value={`${(part.marginPercent * 100).toFixed(1)}%`}
        />
        <Stat label="Fornecedor" value={part.supplier} />
      </div>

      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-4 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
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
                    <span className="text-muted-foreground">{formatDate(entry.timestamp)}</span>
                    <span className="font-mono">
                      {before !== undefined ? formatPrice(before) : "?"} →{" "}
                      {after !== undefined ? formatPrice(after) : "?"}
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
    </Section>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={highlight ? "text-lg font-semibold text-foreground" : "text-sm text-foreground"}
      >
        {value}
      </p>
    </div>
  );
}
