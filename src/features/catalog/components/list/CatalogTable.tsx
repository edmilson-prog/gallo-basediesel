import { useMemo, type MouseEvent as ReactMouseEvent } from "react";
import type { ID, IPart } from "@/shared/types";
import { Icon } from "@/components/Icon";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { CATALOG_STRINGS } from "../../i18n/pt-BR";
import { type CatalogOrderBy, type ICatalogListSort } from "../../utils/listFilters";
import { type ColumnId, type OptionalColumn } from "../../utils/columns";
import { turnoverFor, type IPartTurnover } from "../../utils/turnover";
import { useCatalogColumnWidths } from "../../hooks/useCatalogColumnWidths";
import { CatalogColumnsContextContent, CatalogColumnsDropdown } from "./CatalogColumnsMenu";
import {
  CategoryTile,
  PartApplicationsCell,
  PartCategoryCell,
  PartCodesCell,
  PartFichaCell,
  PartIdentityCell,
  PartManufacturerCell,
  PartMarginCell,
  PartPriceCell,
  PartStatusCell,
  PartStockCell,
  PartTurnoverCell,
} from "./CatalogRowCells";

export interface ICatalogTableProps {
  parts: IPart[];
  isLoading: boolean;
  sort: ICatalogListSort;
  onSortChange: (sort: ICatalogListSort) => void;
  onRowClick: (id: ID) => void;
  visibleColumns: Set<OptionalColumn>;
  onToggleColumn: (id: OptionalColumn) => void;
  onShowAllColumns: () => void;
  /** Columns this role may toggle — permission-gated ones never reach the menu. */
  availableColumns?: readonly OptionalColumn[];
  /** Exposes the inner scroll container (drives the header progress line). */
  scrollRef?: (el: HTMLDivElement | null) => void;
  selectedIds: Set<ID>;
  onToggleRow: (id: ID) => void;
  onToggleVisible: (parts: IPart[]) => void;
  turnoverIndex: Map<ID, IPartTurnover> | null;
  isTurnoverLoading: boolean;
  onRestock: (part: IPart) => void;
  onSuggestDeactivate: (part: IPart) => void;
}

/** Leading selection column — fixed width, not resizable. */
const SELECT_COLUMN_WIDTH = 38;
/** Category tile column — fixed width, not resizable. */
const TILE_COLUMN_WIDTH = 56;
/** Trailing actions column — holds the columns menu trigger. */
const ACTIONS_COLUMN_WIDTH = 44;

interface IColumnConfig {
  id: ColumnId;
  label: string;
  /** Absent when the column has no meaningful ordering. */
  field?: CatalogOrderBy;
}

/**
 * Column order follows the design kit's working desk: identity, codes, the
 * category, what the record is still missing, then the commercial numbers.
 */
const COLUMNS: IColumnConfig[] = [
  { id: "name", label: CATALOG_STRINGS.columns.name, field: "name" },
  { id: "oem", label: CATALOG_STRINGS.columns.oem, field: "oem" },
  { id: "category", label: CATALOG_STRINGS.columns.category, field: "category" },
  { id: "ficha", label: CATALOG_STRINGS.columns.ficha, field: "ficha" },
  { id: "manufacturer", label: CATALOG_STRINGS.columns.manufacturer, field: "manufacturer" },
  { id: "applications", label: CATALOG_STRINGS.columns.applications, field: "applications" },
  { id: "price", label: CATALOG_STRINGS.columns.price, field: "unitPrice" },
  { id: "margin", label: CATALOG_STRINGS.columns.margin, field: "margin" },
  { id: "turnover", label: CATALOG_STRINGS.columns.turnover, field: "turnover" },
  { id: "stock", label: CATALOG_STRINGS.columns.stock, field: "stockAvailable" },
  { id: "status", label: CATALOG_STRINGS.columns.status, field: "status" },
];

export function CatalogTable({
  parts,
  isLoading,
  sort,
  onSortChange,
  onRowClick,
  visibleColumns,
  onToggleColumn,
  onShowAllColumns,
  availableColumns,
  scrollRef,
  selectedIds,
  onToggleRow,
  onToggleVisible,
  turnoverIndex,
  isTurnoverLoading,
  onRestock,
  onSuggestDeactivate,
}: ICatalogTableProps) {
  const { widths, setWidth, commit } = useCatalogColumnWidths();

  // name is mandatory; optional columns honor the visibility set.
  const visibleCols = useMemo(
    () =>
      COLUMNS.filter((col) => col.id === "name" || visibleColumns.has(col.id as OptionalColumn)),
    [visibleColumns],
  );

  const tableWidth =
    SELECT_COLUMN_WIDTH +
    TILE_COLUMN_WIDTH +
    visibleCols.reduce((sum, col) => sum + widths[col.id], 0) +
    ACTIONS_COLUMN_WIDTH;

  const allVisibleSelected = parts.length > 0 && parts.every((part) => selectedIds.has(part.id));
  const someVisibleSelected = !allVisibleSelected && parts.some((part) => selectedIds.has(part.id));

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

  const renderCell = (col: IColumnConfig, part: IPart) => {
    switch (col.id) {
      case "name":
        return <PartIdentityCell part={part} />;
      case "oem":
        return <PartCodesCell part={part} />;
      case "category":
        return <PartCategoryCell part={part} />;
      case "ficha":
        return <PartFichaCell part={part} />;
      case "manufacturer":
        return <PartManufacturerCell part={part} />;
      case "applications":
        return <PartApplicationsCell part={part} />;
      case "price":
        return <PartPriceCell part={part} />;
      case "margin":
        return <PartMarginCell part={part} />;
      case "turnover":
        return (
          <PartTurnoverCell
            part={part}
            turnover={turnoverFor(turnoverIndex, part.id)}
            isLoading={isTurnoverLoading}
            onSuggestDeactivate={onSuggestDeactivate}
          />
        );
      case "stock":
        return <PartStockCell part={part} onRestock={onRestock} />;
      case "status":
        return <PartStatusCell part={part} />;
      default:
        return null;
    }
  };

  return (
    <div ref={scrollRef} className="h-full overflow-auto">
      <table
        className="table-fixed border-separate border-spacing-0 text-sm"
        style={{ width: tableWidth }}
      >
        <colgroup>
          <col style={{ width: SELECT_COLUMN_WIDTH }} />
          <col style={{ width: TILE_COLUMN_WIDTH }} />
          {visibleCols.map((col) => (
            <col key={col.id} style={{ width: widths[col.id] }} />
          ))}
          <col style={{ width: ACTIONS_COLUMN_WIDTH }} />
        </colgroup>
        <thead className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur">
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <tr className="text-left [&>th:not(:last-child)]:border-r [&>th:not(:last-child)]:border-border/70">
                <th className="px-3 py-2">
                  <Checkbox
                    checked={allVisibleSelected || (someVisibleSelected && "indeterminate")}
                    onCheckedChange={() => onToggleVisible(parts)}
                    disabled={parts.length === 0}
                    aria-label={CATALOG_STRINGS.bulk.selectVisible}
                    title={CATALOG_STRINGS.bulk.selectVisible}
                  />
                </th>
                <th className="px-2 py-2" />
                {visibleCols.map((col) => {
                  const active = col.field != null && sort.orderBy === col.field;
                  const icon = active
                    ? sort.orderDir === "asc"
                      ? "mdi:arrow-up"
                      : "mdi:arrow-down"
                    : "mdi:unfold-more-horizontal";
                  return (
                    <th key={col.id} className="relative overflow-hidden px-2 py-2">
                      <button
                        type="button"
                        disabled={col.field == null}
                        onClick={() => col.field && handleSort(col.field)}
                        className={cn(
                          "inline-flex max-w-full items-center gap-1 truncate text-[9.5px] font-bold uppercase tracking-[0.14em]",
                          active ? "text-foreground" : "text-muted-foreground",
                          col.field != null && "hover:text-foreground",
                        )}
                      >
                        <span className="truncate">{col.label}</span>
                        {col.field != null && (
                          <Icon
                            icon={icon}
                            size={11}
                            className={cn(active ? "text-primary" : "opacity-40")}
                          />
                        )}
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
                    available={availableColumns}
                  />
                </th>
              </tr>
            </ContextMenuTrigger>
            <CatalogColumnsContextContent
              visible={visibleColumns}
              onToggle={onToggleColumn}
              onShowAll={onShowAllColumns}
              available={availableColumns}
            />
          </ContextMenu>
        </thead>
        <tbody>
          {isLoading && parts.length === 0
            ? Array.from({ length: 8 }).map((_, i) => (
                <tr key={`skeleton-${i}`} className="border-b border-border">
                  <td className="px-3 py-3" />
                  <td className="px-2 py-3">
                    <Skeleton className="h-9 w-9 rounded-lg" />
                  </td>
                  <td className="px-2 py-3" colSpan={visibleCols.length + 1}>
                    <Skeleton className="h-4 w-3/4" />
                  </td>
                </tr>
              ))
            : parts.map((part) => {
                const isSelected = selectedIds.has(part.id);
                return (
                  <tr
                    key={part.id}
                    onClick={() => onRowClick(part.id)}
                    className={cn(
                      "cursor-pointer border-b border-border transition-colors",
                      isSelected ? "bg-primary/5" : "hover:bg-muted/50",
                      !part.active && "opacity-60",
                    )}
                  >
                    <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => onToggleRow(part.id)}
                        aria-label={`Selecionar ${part.name}`}
                      />
                    </td>
                    <td className="px-2 py-2.5">
                      <CategoryTile category={part.category} />
                    </td>
                    {visibleCols.map((col) => (
                      <td key={col.id} className="overflow-hidden px-2 py-2.5">
                        {renderCell(col, part)}
                      </td>
                    ))}
                    <td className="px-1 py-2.5" />
                  </tr>
                );
              })}
        </tbody>
      </table>
    </div>
  );
}
