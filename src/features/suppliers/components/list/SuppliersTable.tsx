import type { ID, ISupplier, ISupplierStats } from "@/shared/types";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useResizableColumns } from "@/shared/hooks/useResizableColumns";
import { cn } from "@/lib/utils";
import { SUPPLIER_MISSING_LABELS, supplierCompleteness } from "../../engine/completeness";
import {
  COLUMN_LABELS,
  DEFAULT_COLUMN_WIDTHS,
  OPTIONAL_COLUMNS,
  WIDTHS_STORAGE_KEY,
  type OptionalColumn,
  type SupplierColumnId,
} from "../../utils/columns";
import { SUPPLIERS_STRINGS } from "../../i18n/pt-BR";
import { SuppliersColumnsContextContent } from "./SuppliersColumnsMenu";

const COPY = SUPPLIERS_STRINGS;

const CATEGORY_LABEL: Record<ISupplier["category"], string> = {
  parts: COPY.categories.parts,
  services: COPY.categories.services,
  freight: COPY.categories.freight,
  financial: COPY.categories.financial,
};

/**
 * The complete, stable column list — `supplier` first, then every optional
 * column in canonical order. Always passed IN FULL to `useResizableColumns`:
 * its `useState` initializer only runs once, so a column absent on first
 * render would never get a width and reappearing it later would render
 * `"undefinedpx"` in `gridTemplateColumns`. What's actually shown is decided
 * separately, when building `columns` below.
 */
const ALL_COLUMNS: SupplierColumnId[] = ["supplier", ...OPTIONAL_COLUMNS];
const RESIZABLE_COLUMNS = ALL_COLUMNS.map((id) => ({
  id,
  defaultWidth: DEFAULT_COLUMN_WIDTHS[id],
}));

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase();
}

function brl(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

interface ISuppliersTableProps {
  suppliers: ISupplier[];
  statsIndex: Map<ID, ISupplierStats> | null;
  isLoading: boolean;
  selectedId: ID | null;
  onSelect: (id: ID) => void;
  visibleColumns: Set<OptionalColumn>;
  onToggleColumn: (id: OptionalColumn) => void;
  onShowAllColumns: () => void;
  /** Exposes the inner scroll container to the header progress line. */
  scrollRef?: (el: HTMLDivElement | null) => void;
}

export function SuppliersTable({
  suppliers,
  statsIndex,
  isLoading,
  selectedId,
  onSelect,
  visibleColumns,
  onToggleColumn,
  onShowAllColumns,
  scrollRef,
}: ISuppliersTableProps) {
  const { widths, startResize } = useResizableColumns(RESIZABLE_COLUMNS, WIDTHS_STORAGE_KEY);

  const columns: SupplierColumnId[] = [
    "supplier",
    ...OPTIONAL_COLUMNS.filter((id) => visibleColumns.has(id)),
  ];

  const gridTemplate = columns.map((id) => `${widths[id]}px`).join(" ");

  return (
    // `h-full` bounds the scroll container to its grid cell (CatalogTable
    // does the same) — without it the div grows with content instead of
    // scrolling, and the progress line / sticky header would have nothing to do.
    <div ref={scrollRef} className="h-full overflow-auto rounded-xl border border-border bg-card">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            className="sticky top-0 z-10 grid border-b border-border bg-muted/40"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            {columns.map((id, index) => (
              <span
                key={id}
                className={cn(
                  "relative px-4 py-2.5 text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground",
                  // Vertical delimiters live in the header only.
                  index > 0 && "border-l border-border",
                  (id === "parts" || id === "purchases") && "text-right",
                )}
              >
                {COLUMN_LABELS[id]}
                <span
                  role="separator"
                  aria-orientation="vertical"
                  onPointerDown={(e) => startResize(id, e)}
                  className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-primary/40"
                />
              </span>
            ))}
          </div>
        </ContextMenuTrigger>
        <SuppliersColumnsContextContent
          visible={visibleColumns}
          onToggle={onToggleColumn}
          onShowAll={onShowAllColumns}
        />
      </ContextMenu>

      {isLoading
        ? Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="border-b border-border px-4 py-3">
              <Skeleton className="h-6 w-full" />
            </div>
          ))
        : suppliers.map((supplier) => {
            const stats = statsIndex?.get(supplier.id) ?? null;
            const completeness = supplierCompleteness(supplier);
            // Destructured once: `noUncheckedIndexedAccess` won't narrow a
            // fresh `completeness.missing[0]` expression from a `.length`
            // check, but it does narrow a plain variable in a ternary.
            const [firstMissing] = completeness.missing;
            const selected = supplier.id === selectedId;
            return (
              <div
                key={supplier.id}
                role="button"
                tabIndex={0}
                onClick={() => onSelect(supplier.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") onSelect(supplier.id);
                }}
                className={cn(
                  "grid cursor-pointer items-center border-b border-border transition-colors",
                  selected ? "bg-primary/10" : "hover:bg-accent/50",
                )}
                style={{ gridTemplateColumns: gridTemplate }}
              >
                {columns.map((id) => {
                  switch (id) {
                    case "supplier":
                      return (
                        <span key={id} className="flex min-w-0 items-center gap-2.5 px-4 py-2.5">
                          <span className="grid size-7 shrink-0 place-items-center rounded-md bg-primary/15 text-[11px] font-bold text-primary">
                            {initials(supplier.name)}
                          </span>
                          <span className="min-w-0">
                            <span className="block truncate text-[13px] font-semibold text-foreground">
                              {supplier.name}
                            </span>
                            <span className="block truncate text-[11px] text-muted-foreground">
                              {CATEGORY_LABEL[supplier.category]}
                              {supplier.leadTimeDays !== undefined &&
                                COPY.table.leadTimeSuffix(supplier.leadTimeDays)}
                            </span>
                          </span>
                        </span>
                      );
                    case "terms":
                      return (
                        <span
                          key={id}
                          className="truncate px-4 py-2.5 text-xs text-muted-foreground"
                        >
                          {supplier.paymentTerms ?? "—"}
                        </span>
                      );
                    case "parts":
                      return (
                        <span
                          key={id}
                          className="px-4 py-2.5 text-right text-xs text-muted-foreground"
                        >
                          {stats ? stats.linkedParts : "—"}
                        </span>
                      );
                    case "purchases":
                      return (
                        <span
                          key={id}
                          className="px-4 py-2.5 text-right text-[13px] font-bold text-foreground"
                        >
                          {stats ? brl(stats.purchasesLast12Months) : "—"}
                        </span>
                      );
                    case "completeness":
                      return (
                        <span key={id} className="flex items-center gap-2 px-4 py-2.5">
                          <span className="h-1.5 w-9 shrink-0 overflow-hidden rounded-full bg-muted">
                            <span
                              className={cn(
                                "block h-full",
                                completeness.percent >= 80
                                  ? "bg-severity-success"
                                  : completeness.percent >= 40
                                    ? "bg-severity-warning"
                                    : "bg-severity-critical",
                              )}
                              style={{ width: `${completeness.percent}%` }}
                            />
                          </span>
                          <span className="truncate text-[11px] text-muted-foreground">
                            {firstMissing ? SUPPLIER_MISSING_LABELS[firstMissing] : COPY.complete}
                          </span>
                        </span>
                      );
                    case "contact":
                      return (
                        <span
                          key={id}
                          className="truncate px-4 py-2.5 text-xs text-muted-foreground"
                        >
                          {supplier.contactName ?? supplier.contactPhone ?? "—"}
                        </span>
                      );
                  }
                })}
              </div>
            );
          })}

      {!isLoading && suppliers.length === 0 && (
        <div className="px-4 py-16 text-center">
          <p className="text-sm text-foreground">{COPY.empty.list}</p>
          <p className="mt-1 text-xs text-muted-foreground">{COPY.empty.listHint}</p>
        </div>
      )}
    </div>
  );
}
