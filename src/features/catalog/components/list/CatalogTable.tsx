import { Fragment, useMemo, type MouseEvent as ReactMouseEvent } from "react";
import type { IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import { getCategoryLabel } from "../../utils/categories";
import { type CatalogOrderBy, type ICatalogListSort } from "../../utils/listFilters";
import { type ColumnId, type OptionalColumn } from "../../utils/columns";
import { useCatalogColumnWidths } from "../../hooks/useCatalogColumnWidths";
import { PartImage } from "../PartImage";
import { StockBadge } from "../StockBadge";
import { CatalogColumnsContextContent, CatalogColumnsDropdown } from "./CatalogColumnsMenu";

export interface ICatalogTableProps {
  parts: IPart[];
  isLoading: boolean;
  sort: ICatalogListSort;
  onSortChange: (sort: ICatalogListSort) => void;
  onRowClick: (id: string) => void;
  visibleColumns: Set<OptionalColumn>;
  onToggleColumn: (id: OptionalColumn) => void;
  onShowAllColumns: () => void;
  /** Exposes the inner scroll container (drives the header progress line). */
  scrollRef?: (el: HTMLDivElement | null) => void;
}

/** Leading image column — fixed width, not resizable. */
const IMAGE_COLUMN_WIDTH = 56;
/** Trailing actions column — holds the columns menu trigger. */
const ACTIONS_COLUMN_WIDTH = 44;

interface IColumnConfig {
  id: ColumnId;
  label: string;
  field: CatalogOrderBy;
  align: "left" | "right";
}

const COLUMNS: IColumnConfig[] = [
  { id: "name", label: CATALOG_STRINGS.columns.name, field: "name", align: "left" },
  { id: "oem", label: CATALOG_STRINGS.columns.oem, field: "oem", align: "left" },
  { id: "category", label: CATALOG_STRINGS.columns.category, field: "category", align: "left" },
  {
    id: "manufacturer",
    label: CATALOG_STRINGS.columns.manufacturer,
    field: "manufacturer",
    align: "left",
  },
  {
    id: "applications",
    label: CATALOG_STRINGS.columns.applications,
    field: "applications",
    align: "left",
  },
  { id: "price", label: CATALOG_STRINGS.columns.price, field: "unitPrice", align: "left" },
  { id: "stock", label: CATALOG_STRINGS.columns.stock, field: "stockAvailable", align: "left" },
  { id: "status", label: CATALOG_STRINGS.columns.status, field: "status", align: "left" },
];

function formatPrice(value: number): string {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function applicationsLabel(part: IPart): string {
  const first = part.applications[0];
  if (!first) return "—";
  const head = `${first.vehicleBrand} ${first.vehicleModel}`;
  if (part.applications.length === 1) return head;
  return `${head} +${part.applications.length - 1}`;
}

export function CatalogTable({
  parts,
  isLoading,
  sort,
  onSortChange,
  onRowClick,
  visibleColumns,
  onToggleColumn,
  onShowAllColumns,
  scrollRef,
}: ICatalogTableProps) {
  const { widths, setWidth, commit } = useCatalogColumnWidths();

  // name is mandatory; optional columns honor the visibility set.
  const visibleCols = useMemo(
    () =>
      COLUMNS.filter((col) => col.id === "name" || visibleColumns.has(col.id as OptionalColumn)),
    [visibleColumns],
  );

  const tableWidth =
    IMAGE_COLUMN_WIDTH +
    visibleCols.reduce((sum, col) => sum + widths[col.id], 0) +
    ACTIONS_COLUMN_WIDTH;

  const handleSort = (field: CatalogOrderBy) => {
    const active = sort.orderBy === field;
    onSortChange({
      orderBy: field,
      orderDir: !active ? "asc" : sort.orderDir === "asc" ? "desc" : "asc",
    });
  };

  // Drag a column border to resize it; persists on mouse up.
  const startResize = (e: ReactMouseEvent, id: ColumnId) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startWidth = widths[id];
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: MouseEvent) => setWidth(id, startWidth + (ev.clientX - startX));
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      commit();
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  return (
    <div ref={scrollRef} className="h-full overflow-auto">
      <table
        className="table-fixed border-separate border-spacing-0 text-sm"
        style={{ width: tableWidth }}
      >
        <colgroup>
          <col style={{ width: IMAGE_COLUMN_WIDTH }} />
          {visibleCols.map((col) => (
            <col key={col.id} style={{ width: widths[col.id] }} />
          ))}
          <col style={{ width: ACTIONS_COLUMN_WIDTH }} />
        </colgroup>
        <thead className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <tr className="text-left [&>th:not(:last-child)]:border-r [&>th:not(:last-child)]:border-border/70">
                <th className="px-4 py-2"></th>
                {visibleCols.map((col) => {
                  const active = sort.orderBy === col.field;
                  const icon = active
                    ? sort.orderDir === "asc"
                      ? "mdi:arrow-up"
                      : "mdi:arrow-down"
                    : "mdi:unfold-more-horizontal";
                  return (
                    <th
                      key={col.id}
                      className={cn(
                        "relative overflow-hidden px-2 py-2",
                        col.align === "right" && "text-right",
                      )}
                    >
                      <button
                        type="button"
                        onClick={() => handleSort(col.field)}
                        className="inline-flex max-w-full items-center gap-1 truncate text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
                      >
                        <span className="truncate">{col.label}</span>
                        <Icon icon={icon} size={12} className={cn(!active && "opacity-40")} />
                      </button>
                      <span
                        role="separator"
                        aria-orientation="vertical"
                        aria-label={`Redimensionar coluna ${col.label}`}
                        onMouseDown={(e) => startResize(e, col.id)}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 top-0 z-20 h-full w-1.5 cursor-col-resize touch-none hover:bg-primary/40"
                      />
                    </th>
                  );
                })}
                <th className="px-1 py-2 text-right">
                  <CatalogColumnsDropdown
                    visible={visibleColumns}
                    onToggle={onToggleColumn}
                    onShowAll={onShowAllColumns}
                  />
                </th>
              </tr>
            </ContextMenuTrigger>
            <CatalogColumnsContextContent
              visible={visibleColumns}
              onToggle={onToggleColumn}
              onShowAll={onShowAllColumns}
            />
          </ContextMenu>
        </thead>
        <tbody>
          {isLoading && parts.length === 0
            ? Array.from({ length: 8 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="border-b border-border">
                  <td className="px-4 py-3">
                    <Skeleton className="h-10 w-10 rounded-md" />
                  </td>
                  <td className="px-2 py-3" colSpan={visibleCols.length + 1}>
                    <Skeleton className="h-4 w-3/4" />
                  </td>
                </tr>
              ))
            : parts.map((part) => (
                <Fragment key={part.id}>
                  <tr
                    onClick={() => onRowClick(part.id)}
                    className={cn(
                      "cursor-pointer border-b border-border transition-colors hover:bg-muted/50",
                      !part.active && "opacity-60",
                    )}
                  >
                    <td className="px-4 py-3">
                      <PartImage part={part} size="sm" />
                    </td>
                    <td className="overflow-hidden px-2 py-3">
                      <div className="flex flex-col">
                        <span className="truncate font-medium uppercase text-foreground">
                          {part.name}
                        </span>
                        <span className="truncate text-xs text-muted-foreground">{part.sku}</span>
                      </div>
                    </td>
                    {visibleColumns.has("oem") && (
                      <td className="truncate px-2 py-3 font-mono text-xs text-foreground">
                        {part.oemCodes[0] ?? "—"}
                      </td>
                    )}
                    {visibleColumns.has("category") && (
                      <td className="overflow-hidden px-2 py-3 text-foreground">
                        <div className="flex flex-col">
                          <span className="truncate text-xs">
                            {getCategoryLabel(part.category)}
                          </span>
                          {part.subcategory && (
                            <span className="truncate text-[10px] uppercase tracking-wide text-muted-foreground">
                              {part.subcategory}
                            </span>
                          )}
                        </div>
                      </td>
                    )}
                    {visibleColumns.has("manufacturer") && (
                      <td className="overflow-hidden px-2 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-foreground">{part.brand}</span>
                          {part.isOriginal && (
                            <span className="inline-flex shrink-0 items-center rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-300">
                              {CATALOG_STRINGS.badges.original}
                            </span>
                          )}
                        </div>
                      </td>
                    )}
                    {visibleColumns.has("applications") && (
                      <td className="truncate px-2 py-3 text-xs text-muted-foreground">
                        {applicationsLabel(part)}
                      </td>
                    )}
                    {visibleColumns.has("price") && (
                      <td className="truncate px-2 py-3 font-medium text-foreground">
                        {formatPrice(part.unitPrice)}
                      </td>
                    )}
                    {visibleColumns.has("stock") && (
                      <td className="px-2 py-3">
                        <StockBadge part={part} variant="compact" />
                      </td>
                    )}
                    {visibleColumns.has("status") && (
                      <td className="overflow-hidden px-2 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center gap-1 text-xs",
                            part.active
                              ? "text-severity-success"
                              : "text-muted-foreground",
                          )}
                        >
                          <span
                            className={cn(
                              "h-1.5 w-1.5 shrink-0 rounded-full",
                              part.active ? "bg-severity-success" : "bg-muted-foreground",
                            )}
                            aria-hidden="true"
                          />
                          {part.active
                            ? CATALOG_STRINGS.status.active
                            : CATALOG_STRINGS.status.inactive}
                        </span>
                      </td>
                    )}
                    <td className="px-1 py-3" />
                  </tr>
                </Fragment>
              ))}
        </tbody>
      </table>
    </div>
  );
}
