import type { PointerEvent as ReactPointerEvent } from "react";
import type { ICustomer, ID, IOrder, ISeller } from "@/shared/types";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { useResizableColumns } from "@/shared/hooks/useResizableColumns";
import { OrderStatusBadge } from "../OrderStatusBadge";
import { OrderOriginBadge } from "../OrderOriginBadge";
import { computeOrderStatus } from "../../utils/orderStatus";
import { OrdersColumnsContextContent, OrdersColumnsDropdown } from "./OrdersColumnsMenu";
import { COLUMN_LABELS, type ColumnId, type OptionalColumn } from "../../utils/columns";
import type { IOrdersListSort, OrderOrderBy } from "../../utils/listFilters";

const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

const COLUMN_WIDTHS_KEY = "gallo-orders-column-widths";

/** Trailing actions column — holds the columns menu trigger. */
const ACTIONS_COLUMN_WIDTH = 44;

interface IOrderColumnDef {
  id: ColumnId;
  label: string;
  defaultWidth: number;
  sortBy: OrderOrderBy;
  align?: "right";
}

const COLUMNS: readonly IOrderColumnDef[] = [
  { id: "number", label: COLUMN_LABELS.number, defaultWidth: 130, sortBy: "number" },
  { id: "customer", label: COLUMN_LABELS.customer, defaultWidth: 260, sortBy: "customer" },
  { id: "origin", label: COLUMN_LABELS.origin, defaultWidth: 110, sortBy: "origin" },
  { id: "seller", label: COLUMN_LABELS.seller, defaultWidth: 170, sortBy: "seller" },
  { id: "total", label: COLUMN_LABELS.total, defaultWidth: 130, sortBy: "total", align: "right" },
  { id: "status", label: COLUMN_LABELS.status, defaultWidth: 180, sortBy: "status" },
  { id: "createdAt", label: COLUMN_LABELS.createdAt, defaultWidth: 100, sortBy: "createdAt" },
];

export interface IOrdersTableProps {
  orders: IOrder[];
  isLoading: boolean;
  sort: IOrdersListSort;
  onSortChange: (sort: IOrdersListSort) => void;
  onRowClick: (id: ID) => void;
  sellers: Map<ID, ISeller>;
  customers: Map<ID, ICustomer>;
  visibleColumns: Set<OptionalColumn>;
  onToggleColumn: (id: OptionalColumn) => void;
  onShowAllColumns: () => void;
  /** Exposes the inner scroll container (drives the header progress line). */
  scrollRef?: (el: HTMLDivElement | null) => void;
}

function customerName(c: ICustomer | undefined): string {
  if (!c) return "—";
  if (c.type === "B2B") return c.nomeFantasia || c.razaoSocial;
  return c.fullName;
}

function ResizeHandle({ onPointerDown }: { onPointerDown: (e: ReactPointerEvent) => void }) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      onPointerDown={onPointerDown}
      onClick={(e) => e.stopPropagation()}
      className="absolute right-0 top-0 z-10 h-full w-1.5 cursor-col-resize touch-none select-none hover:bg-primary/40"
    />
  );
}

export function OrdersTable({
  orders,
  isLoading,
  sort,
  onSortChange,
  onRowClick,
  sellers,
  customers,
  visibleColumns,
  onToggleColumn,
  onShowAllColumns,
  scrollRef,
}: IOrdersTableProps) {
  const { widths, startResize } = useResizableColumns(COLUMNS, COLUMN_WIDTHS_KEY);

  // number is mandatory; optional columns honor the visibility set.
  const visibleCols = COLUMNS.filter(
    (col) => col.id === "number" || visibleColumns.has(col.id as OptionalColumn),
  );
  const tableWidth =
    visibleCols.reduce((sum, col) => sum + widths[col.id], 0) + ACTIONS_COLUMN_WIDTH;

  const toggleSort = (field: OrderOrderBy) => {
    if (sort.orderBy !== field) {
      onSortChange({ orderBy: field, orderDir: "desc" });
    } else {
      onSortChange({ orderBy: field, orderDir: sort.orderDir === "asc" ? "desc" : "asc" });
    }
  };

  const SortHeader = ({ col }: { col: IOrderColumnDef }) => {
    const active = sort.orderBy === col.sortBy;
    return (
      <button
        type="button"
        onClick={() => toggleSort(col.sortBy)}
        className={cn(
          "inline-flex w-full items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground",
          col.align === "right" && "justify-end",
        )}
      >
        <span className="truncate">{col.label}</span>
        <Icon
          icon={
            active
              ? sort.orderDir === "asc"
                ? "mdi:arrow-up"
                : "mdi:arrow-down"
              : "mdi:unfold-more-horizontal"
          }
          size={12}
          className={cn(!active && "opacity-40")}
        />
      </button>
    );
  };

  if (isLoading && orders.length === 0) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  const renderCell = (col: IOrderColumnDef, o: IOrder) => {
    const customer = customers.get(o.customerId);
    const seller = sellers.get(o.sellerId);
    const sellerName = seller?.fullName ?? (o.sellerId === "sdr-agent" ? "Agente SDR" : "—");
    switch (col.id) {
      case "number":
        return (
          <TableCell
            key={col.id}
            className="truncate font-mono text-xs font-semibold text-foreground"
          >
            #{o.number ?? o.id.replace(/^order-/, "PD-")}
          </TableCell>
        );
      case "customer":
        return (
          <TableCell key={col.id} className="truncate text-sm text-foreground">
            {customerName(customer)}
          </TableCell>
        );
      case "origin":
        return (
          <TableCell key={col.id}>
            <OrderOriginBadge order={o} size="sm" />
          </TableCell>
        );
      case "seller":
        return (
          <TableCell key={col.id} className="truncate text-sm text-muted-foreground">
            {sellerName}
          </TableCell>
        );
      case "total":
        return (
          <TableCell key={col.id} className="text-right text-sm font-semibold tabular-nums">
            {moneyFormatter.format(o.total)}
          </TableCell>
        );
      case "status":
        return (
          <TableCell key={col.id}>
            <OrderStatusBadge status={computeOrderStatus(o)} size="sm" />
          </TableCell>
        );
      case "createdAt":
        return (
          <TableCell key={col.id} className="truncate text-xs text-muted-foreground">
            {dateFormatter.format(new Date(o.createdAt))}
          </TableCell>
        );
    }
  };

  return (
    <Table
      containerRef={scrollRef}
      className="w-full table-fixed"
      containerClassName="h-full"
      style={{ minWidth: tableWidth }}
    >
      <colgroup>
        {visibleCols.map((col) => (
          <col key={col.id} style={{ width: widths[col.id] }} />
        ))}
        <col style={{ width: ACTIONS_COLUMN_WIDTH }} />
      </colgroup>
      <TableHeader>
        <ContextMenu>
          <ContextMenuTrigger asChild>
            {/* Vertical delimiters between columns live in the header only. */}
            <TableRow className="hover:bg-transparent [&>th:not(:last-child)]:border-r [&>th:not(:last-child)]:border-border/70">
              {visibleCols.map((col) => (
                <TableHead
                  key={col.id}
                  className={cn(
                    "sticky top-0 z-20 overflow-hidden bg-background",
                    col.align === "right" && "text-right",
                  )}
                >
                  <SortHeader col={col} />
                  <ResizeHandle onPointerDown={(e) => startResize(col.id, e)} />
                </TableHead>
              ))}
              <TableHead className="sticky top-0 z-20 bg-background px-1 text-right">
                <OrdersColumnsDropdown
                  visible={visibleColumns}
                  onToggle={onToggleColumn}
                  onShowAll={onShowAllColumns}
                />
              </TableHead>
            </TableRow>
          </ContextMenuTrigger>
          <OrdersColumnsContextContent
            visible={visibleColumns}
            onToggle={onToggleColumn}
            onShowAll={onShowAllColumns}
          />
        </ContextMenu>
      </TableHeader>
      <TableBody>
        {orders.map((o) => (
          <TableRow
            key={o.id}
            className={cn("cursor-pointer transition-colors hover:bg-muted/60")}
            onClick={() => onRowClick(o.id)}
          >
            {visibleCols.map((col) => renderCell(col, o))}
            <TableCell className="px-1" />
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
