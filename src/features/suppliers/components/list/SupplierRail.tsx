import type { ISupplier, ISupplierStats } from "@/shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { formatBRL } from "@/shared/utils/format";
import { supplierCompleteness } from "../../engine/completeness";
import { SUPPLIERS_STRINGS } from "../../i18n/pt-BR";
import { CATEGORY_LABEL, initials } from "../../utils/supplierDisplay";

const COPY = SUPPLIERS_STRINGS;

/** Day/month only — density over precision at this size. Mirrors `CatalogRowCells`. */
function formatShortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="min-w-0">
      <span className="block text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">
        {label}
      </span>
      <span className="mt-1 block truncate text-lg font-bold leading-none text-foreground">
        {value}
      </span>
      {sub && (
        <span className="mt-1.5 block truncate text-[11px] text-muted-foreground">{sub}</span>
      )}
    </div>
  );
}

interface ISupplierRailProps {
  supplier: ISupplier | null;
  stats: ISupplierStats | null;
  canEdit: boolean;
  onOpenSheet: () => void;
  onEdit: () => void;
}

/**
 * Identity + metrics rail for the selected supplier row. `stats` is `null`
 * both while `useSuppliersStatsIndex` is loading and when the supplier
 * legitimately has no stats row — either way the KPIs read "—", never a
 * fabricated zero. The "Em aberto" metric from the design kit is absent on
 * purpose: it needs the `payable` entity, which does not exist yet.
 */
export function SupplierRail({
  supplier,
  stats,
  canEdit,
  onOpenSheet,
  onEdit,
}: ISupplierRailProps) {
  if (!supplier) {
    return (
      <aside className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
        {COPY.rail.emptySelection}
      </aside>
    );
  }

  const completeness = supplierCompleteness(supplier);

  return (
    <aside className="grid gap-3">
      <section className="rounded-xl border border-border bg-card p-4">
        <div className="mb-3.5 flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/15 text-sm font-bold text-primary">
            {initials(supplier.name)}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold leading-tight text-foreground">
              {supplier.name}
            </h2>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <Badge variant="secondary">{CATEGORY_LABEL[supplier.category]}</Badge>
              {supplier.paymentTerms && <Badge variant="outline">{supplier.paymentTerms}</Badge>}
              {supplier.source === "manual" && completeness.percent === 0 && (
                <Badge>{COPY.newBadge}</Badge>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3.5 border-t border-border pt-3.5">
          <Metric label={COPY.kpis.linkedParts} value={stats ? String(stats.linkedParts) : "—"} />
          <Metric label={COPY.kpis.purchases} value={formatBRL(stats?.purchasesLast12Months)} />
          <Metric
            label={COPY.kpis.leadTime}
            value={
              supplier.leadTimeDays === undefined
                ? "—"
                : `${supplier.leadTimeDays} ${COPY.kpis.leadTimeUnit}`
            }
          />
          <Metric
            label={COPY.columns.contact}
            value={supplier.contactName ?? "—"}
            sub={supplier.contactPhone}
          />
        </div>

        <div className="mt-4 flex gap-2">
          <Button size="sm" className="flex-1" onClick={onOpenSheet}>
            <Icon icon="mdi:arrow-expand" size={15} />
            {COPY.actions.fullSheet}
          </Button>
          {canEdit && (
            <Button size="sm" variant="outline" onClick={onEdit} aria-label={COPY.actions.edit}>
              <Icon icon="mdi:pencil" size={15} />
            </Button>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card">
        <h3 className="flex items-center gap-2 border-b border-border px-4 py-3 text-[13px] font-bold text-foreground">
          <Icon icon="mdi:package-variant" size={15} className="text-muted-foreground" />
          {COPY.rail.suppliedItems}
        </h3>
        <div className="flex flex-wrap gap-1.5 p-4">
          {supplier.suppliedItems.length ? (
            supplier.suppliedItems.map((item) => (
              <Badge key={item} variant="outline">
                {item}
              </Badge>
            ))
          ) : (
            <p className="text-xs text-muted-foreground">{COPY.empty.items}</p>
          )}
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card">
        <h3 className="flex items-center gap-2 border-b border-border px-4 py-3 text-[13px] font-bold text-foreground">
          <Icon icon="mdi:file-document-outline" size={15} className="text-muted-foreground" />
          {COPY.rail.lastEntries}
        </h3>
        <div className="p-4">
          {stats?.lastEntries.length ? (
            <ul className="grid">
              {stats.lastEntries.slice(0, 4).map((entry, index) => (
                <li
                  key={`${entry.partId}-${entry.invoiceNumber ?? index}`}
                  className="flex items-center gap-2.5 border-b border-border py-2 last:border-b-0"
                >
                  <span className="w-16 shrink-0 text-[11px] text-muted-foreground">
                    {entry.invoiceDate ? formatShortDate(entry.invoiceDate) : "—"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                    {entry.invoiceNumber ?? entry.partName}
                  </span>
                  <span className="shrink-0 text-xs font-bold text-foreground">
                    {formatBRL(entry.cost * (entry.quantity || 1))}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-muted-foreground">{COPY.empty.entries}</p>
          )}
        </div>
      </section>
    </aside>
  );
}
