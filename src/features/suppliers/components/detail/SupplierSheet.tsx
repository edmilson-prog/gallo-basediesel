import type { ISupplier, ISupplierStats } from "@/shared/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatBRL, formatCNPJ, formatShortDateBR } from "@/shared/utils/format";
import { supplierCompleteness } from "../../engine/completeness";
import { SUPPLIERS_STRINGS } from "../../i18n/pt-BR";
import { CATEGORY_LABEL, initials } from "../../utils/supplierDisplay";
import { SupplierMetric } from "../SupplierMetric";
import { SupplierPurchasesChart } from "./SupplierPurchasesChart";

const COPY = SUPPLIERS_STRINGS;

export interface ISupplierSheetProps {
  supplier: ISupplier | null;
  stats: ISupplierStats | null;
  open: boolean;
  onClose: () => void;
  /** Called when "Editar cadastro" is pressed — the caller decides what happens next. */
  onEdit: () => void;
  canEdit: boolean;
}

/**
 * "Ficha completa" — the full supplier drawer opened from the rail. `stats`
 * being `null` covers two different situations that must read differently:
 * still loading (the sheet shows a neutral "carregando" line, never an
 * assertive empty state) vs. resolved-and-actually-empty (the sheet then
 * shows the honest `empty.*` copy). The "Títulos em aberto" section skips
 * this distinction entirely — there is no `payable` entity yet, so it is
 * ALWAYS the explicit unavailable-data statement, never a number.
 */
export function SupplierSheet({
  supplier,
  stats,
  open,
  onClose,
  onEdit,
  canEdit,
}: ISupplierSheetProps) {
  const isOpen = open && supplier !== null;
  const completeness = supplier ? supplierCompleteness(supplier) : null;
  // "Sem histórico" reads on purchase/entry history, not on cadastro
  // completeness (that's the rail's separate "novo" chip) — gated on
  // `stats !== null` so it never flashes true while stats are still loading.
  const noHistory =
    supplier?.source === "manual" && stats !== null && stats.lastEntries.length === 0;

  return (
    <Sheet open={isOpen} onOpenChange={(next) => !next && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-[600px]">
        {supplier && completeness && (
          <>
            <SheetHeader className="sr-only">
              <SheetTitle>{COPY.sheet.title(supplier.name)}</SheetTitle>
              <SheetDescription>{COPY.sheet.description}</SheetDescription>
            </SheetHeader>

            {/* 1. Cabeçalho */}
            <div className="flex items-start gap-3 border-b border-border px-6 py-5">
              <span className="grid size-12 shrink-0 place-items-center rounded-lg bg-primary/15 text-base font-bold text-primary">
                {initials(supplier.name)}
              </span>
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-lg font-bold leading-tight text-foreground">
                  {supplier.name}
                </h2>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Badge variant="secondary">{CATEGORY_LABEL[supplier.category]}</Badge>
                  {supplier.paymentTerms && (
                    <Badge variant="outline">{supplier.paymentTerms}</Badge>
                  )}
                  {noHistory && <Badge>{COPY.sheet.noHistoryBadge}</Badge>}
                </div>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {/* 2. Grade 3×2 de fatos */}
              <section className="grid grid-cols-3 gap-4 rounded-xl border border-border bg-card p-4">
                <SupplierMetric
                  size="sm"
                  label={COPY.kpis.linkedParts}
                  value={stats ? String(stats.linkedParts) : "—"}
                />
                <SupplierMetric
                  size="sm"
                  label={COPY.kpis.purchases}
                  value={formatBRL(stats?.purchasesLast12Months)}
                />
                <SupplierMetric
                  size="sm"
                  label={COPY.kpis.leadTime}
                  value={
                    supplier.leadTimeDays === undefined
                      ? "—"
                      : `${supplier.leadTimeDays} ${COPY.kpis.leadTimeUnit}`
                  }
                />
                <SupplierMetric
                  size="sm"
                  label={COPY.columns.completeness}
                  value={`${completeness.percent}%`}
                />
                <SupplierMetric
                  size="sm"
                  label={COPY.form.documentLabel}
                  value={supplier.document ? formatCNPJ(supplier.document) : "—"}
                />
                <SupplierMetric
                  size="sm"
                  label={COPY.sheet.factsLabels.registryStatus}
                  value={supplier.registryStatus || "—"}
                />
              </section>

              {/* 3. Compras mês a mês */}
              <section className="rounded-xl border border-border bg-card">
                <h3 className="flex items-center gap-2 border-b border-border px-4 py-3 text-[13px] font-bold text-foreground">
                  <Icon icon="mdi:chart-bar" size={15} className="text-muted-foreground" />
                  {COPY.sheet.purchasesTitle}
                </h3>
                <div className="p-4">
                  {stats === null ? (
                    <p className="text-xs text-muted-foreground">{COPY.sheet.statsLoading}</p>
                  ) : stats.purchasesLast12Months > 0 ? (
                    <SupplierPurchasesChart monthly={stats.monthlyPurchases} />
                  ) : (
                    <p className="text-xs text-muted-foreground">{COPY.empty.purchases}</p>
                  )}
                </div>
              </section>

              {/* 4. Títulos em aberto — sem dado nenhum: sempre o estado explícito. */}
              <section className="rounded-xl border border-border bg-card">
                <h3 className="flex items-center gap-2 border-b border-border px-4 py-3 text-[13px] font-bold text-foreground">
                  <Icon
                    icon="mdi:receipt-text-outline"
                    size={15}
                    className="text-muted-foreground"
                  />
                  {COPY.sheet.payablesTitle}
                </h3>
                <div className="flex items-start gap-2 p-4">
                  <Icon
                    icon="mdi:information-outline"
                    size={15}
                    className="mt-0.5 shrink-0 text-muted-foreground"
                  />
                  <p className="text-xs text-muted-foreground">{COPY.empty.payables}</p>
                </div>
              </section>

              {/* 5. Últimas entradas + O que compramos, lado a lado */}
              <div className="grid grid-cols-2 gap-4">
                <section className="rounded-xl border border-border bg-card">
                  <h3 className="flex items-center gap-2 border-b border-border px-4 py-3 text-[13px] font-bold text-foreground">
                    <Icon
                      icon="mdi:file-document-outline"
                      size={15}
                      className="text-muted-foreground"
                    />
                    {COPY.rail.lastEntries}
                  </h3>
                  <div className="p-4">
                    {stats === null ? (
                      <p className="text-xs text-muted-foreground">{COPY.sheet.statsLoading}</p>
                    ) : stats.lastEntries.length ? (
                      <ul className="grid">
                        {stats.lastEntries.map((entry, index) => (
                          <li
                            key={`${entry.partId}-${entry.invoiceNumber ?? index}`}
                            className="flex items-center gap-2.5 border-b border-border py-2 last:border-b-0"
                          >
                            <span className="w-14 shrink-0 text-[11px] text-muted-foreground">
                              {formatShortDateBR(entry.invoiceDate)}
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
              </div>
            </div>

            {/* 6. Rodapé */}
            <div className="flex items-center justify-between gap-2 border-t border-border p-4">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  title={COPY.sheet.footer.payablesDisabledReason}
                >
                  <Icon icon="mdi:cart-plus" size={15} />
                  {COPY.sheet.footer.newPurchaseOrder}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled
                  title={COPY.sheet.footer.payablesDisabledReason}
                >
                  <Icon icon="mdi:calendar-clock" size={15} />
                  {COPY.sheet.footer.schedulePayments}
                </Button>
              </div>
              {canEdit && (
                <Button size="sm" onClick={onEdit}>
                  <Icon icon="mdi:pencil" size={15} />
                  {COPY.actions.edit}
                </Button>
              )}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
