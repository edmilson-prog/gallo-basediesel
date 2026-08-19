import type { ID, ISupplier, ISupplierStats } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { formatBRL } from "@/shared/utils/format";
import { SUPPLIERS_STRINGS } from "../../i18n/pt-BR";

const COPY = SUPPLIERS_STRINGS.kpis;

interface ISuppliersKpiStripProps {
  suppliers: ISupplier[];
  /**
   * The real row count from `list()`'s `count: "exact"` — not
   * `suppliers.length`. PostgREST caps `.range()` responses at 1.000 rows,
   * so once the active set passes that size the array silently truncates
   * while this count stays accurate. This is what "Fornecedores ativos"
   * must render.
   */
  totalActive: number;
  statsIndex: Map<ID, ISupplierStats> | null;
  /**
   * `null` while the pending-queue fetch hasn't resolved (still loading, or
   * failed) — the cell reads "—" in both cases, never a fabricated `0`. Only
   * a successfully-resolved fetch may show a real count, including a real
   * `0` when the queue is genuinely empty.
   */
  pendingCount: number | null;
  /**
   * The queue is a permanent section below the table, never a hidden tab —
   * there is nothing to "filter" into. Clicking the cell just scrolls the
   * queue into view.
   */
  onFocusPending: () => void;
  /** The list fetch failed — `suppliers` is `[]` because nothing loaded, not
   *  because there are zero suppliers. Every cell that would otherwise read
   *  the count off `suppliers` falls back to "—" instead of a fabricated 0. */
  hasError?: boolean;
}

export function SuppliersKpiStrip({
  suppliers,
  totalActive,
  statsIndex,
  pendingCount,
  onFocusPending,
  hasError = false,
}: ISuppliersKpiStripProps) {
  const linkedParts = statsIndex
    ? Array.from(statsIndex.values()).reduce((sum, s) => sum + s.linkedParts, 0)
    : null;
  const purchases = statsIndex
    ? Array.from(statsIndex.values()).reduce((sum, s) => sum + s.purchasesLast12Months, 0)
    : null;
  const leadTimes = suppliers
    .map((s) => s.leadTimeDays)
    .filter((d): d is number => typeof d === "number");
  const avgLead = leadTimes.length
    ? Math.round(leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length)
    : null;

  const hasPending = pendingCount !== null && pendingCount > 0;

  const cells: Array<{
    label: string;
    value: string;
    sub?: string;
    icon: string;
    accent?: boolean;
    onClick?: () => void;
  }> = [
    { label: COPY.active, value: hasError ? "—" : String(totalActive), icon: "mdi:domain" },
    {
      label: COPY.pending,
      value: pendingCount === null ? "—" : String(pendingCount),
      sub: hasPending ? COPY.pendingHint : undefined,
      icon: "mdi:clock-outline",
      accent: hasPending,
      onClick: hasPending ? onFocusPending : undefined,
    },
    {
      label: COPY.linkedParts,
      value: linkedParts === null ? "—" : String(linkedParts),
      icon: "mdi:cog",
    },
    {
      label: COPY.purchases,
      value: formatBRL(purchases),
      icon: "mdi:package-variant",
    },
    {
      label: COPY.leadTime,
      value: avgLead === null ? "—" : `${avgLead} ${COPY.leadTimeUnit}`,
      icon: "mdi:timer-sand",
    },
  ];

  return (
    <div className="mb-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border md:grid-cols-5">
      {cells.map((cell) => {
        const Tag = cell.onClick ? "button" : "div";
        return (
          <Tag
            key={cell.label}
            {...(cell.onClick ? { type: "button" as const, onClick: cell.onClick } : {})}
            className={cn(
              "bg-card px-4 py-3 text-left",
              cell.onClick && "transition-colors hover:bg-accent",
            )}
          >
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Icon icon={cell.icon} size={13} />
              {cell.label}
            </span>
            <span
              className={cn(
                "mt-1 block text-2xl font-bold leading-none",
                // `severity-info`, not `warning`: a pending row is not an
                // error state, it is work waiting — same tone the queue's
                // own rows use (`SuppliersPendingQueue`), so the KPI and the
                // section it points at read as one concept, not two.
                cell.accent ? "text-severity-info" : "text-foreground",
              )}
            >
              {cell.value}
            </span>
            {cell.sub && (
              <span className="mt-1.5 block text-[11px] text-muted-foreground">{cell.sub}</span>
            )}
          </Tag>
        );
      })}
    </div>
  );
}
