import { useEffect, useMemo, useRef } from "react";
import type { ICustomer, ID } from "@/shared/types";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ContextMenu, ContextMenuTrigger } from "@/components/ui/context-menu";
import { CustomerAvatar } from "../CustomerAvatar";
import { CustomersColumnsContextContent, CustomersColumnsDropdown } from "./CustomersColumnsMenu";
import {
  daysSince,
  formatBRLCompact,
  formatCNPJ,
  formatCPF,
  formatDateBR,
} from "@/shared/utils/format";
import {
  ABC_BADGE_CLASSES,
  STATUS_BADGE_CLASSES,
  TYPE_BADGE_CLASSES,
  getCustomerDisplay,
  getCustomerName,
} from "../../utils/customerDisplay";
import {
  COLUMN_LABELS,
  MANDATORY_COLUMNS,
  type ColumnId,
  type OptionalColumn,
} from "../../utils/columns";
import { highlightSearchTerm } from "../../utils/highlight";
import type { CustomersOrderBy, ICustomersListSort } from "../../utils/listFilters";

const STATUS_LABELS: Record<ICustomer["status"], string> = {
  ativo: "Ativo",
  dormente: "Dormente",
  recuperacao: "Recuperação",
  perdido: "Perdido",
};

const TYPE_LABELS: Record<ICustomer["type"], string> = {
  B2B: "B2B",
  B2C: "B2C",
};

/** Mapping from column id → sortable orderBy value (undefined = not sortable). */
const COLUMN_SORT_KEY: Partial<Record<ColumnId, CustomersOrderBy>> = {
  name: "name",
  type: "type",
  abc: "abcClass",
  status: "status",
  document: "document",
  seller: "seller",
  ticketMedio: "ticketMedio",
  recency: "recency",
  ltv: "ltv",
  tags: "tags",
  city: "city",
  createdAt: "createdAt",
  lastConversation: "lastPurchaseAt",
};

export interface ISellerLookupEntry {
  initials: string;
  name: string;
  hue: number;
  bg: string;
  fg: string;
}

export interface ICustomersTableProps {
  customers: ICustomer[];
  isLoading: boolean;
  isFetching: boolean;
  visibleOptional: OptionalColumn[];
  selectedIds: Set<ID>;
  onToggleSelected: (id: ID, checked: boolean) => void;
  onToggleAllInPage: (checked: boolean) => void;
  selectedDetailId: ID | null;
  onSelectDetail: (id: ID) => void;
  onOpenDetail: (id: ID) => void;
  sort: ICustomersListSort;
  onSortChange: (next: ICustomersListSort) => void;
  searchTerm: string;
  sellersById: Map<ID, ISellerLookupEntry>;
  onToggleColumn: (id: OptionalColumn) => void;
  onShowAllColumns: () => void;
  /** Exposes the inner scroll container (drives the header progress line). */
  scrollRef?: (el: HTMLDivElement | null) => void;
}

export function CustomersTable({
  customers,
  isLoading,
  isFetching,
  visibleOptional,
  selectedIds,
  onToggleSelected,
  onToggleAllInPage,
  selectedDetailId,
  onSelectDetail,
  onOpenDetail,
  sort,
  onSortChange,
  searchTerm,
  sellersById,
  onToggleColumn,
  onShowAllColumns,
  scrollRef,
}: ICustomersTableProps) {
  const allColumns = useMemo<ColumnId[]>(
    () => [...MANDATORY_COLUMNS, ...visibleOptional],
    [visibleOptional],
  );

  const allInPageSelected = customers.length > 0 && customers.every((c) => selectedIds.has(c.id));
  const partialPageSelected = !allInPageSelected && customers.some((c) => selectedIds.has(c.id));

  const handleHeaderClick = (columnId: ColumnId) => {
    const sortKey = COLUMN_SORT_KEY[columnId];
    if (!sortKey) return;
    if (sort.orderBy === sortKey) {
      onSortChange({ orderBy: sortKey, orderDir: sort.orderDir === "asc" ? "desc" : "asc" });
    } else {
      onSortChange({ orderBy: sortKey, orderDir: "asc" });
    }
  };

  const tableRef = useRef<HTMLDivElement>(null);

  // Setas ↑↓ para navegar entre linhas mantendo a ficha aberta (RF-011).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!selectedDetailId) return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      const idx = customers.findIndex((c) => c.id === selectedDetailId);
      if (idx < 0) return;
      e.preventDefault();
      const nextIdx =
        e.key === "ArrowDown" ? Math.min(customers.length - 1, idx + 1) : Math.max(0, idx - 1);
      const next = customers[nextIdx];
      if (next) onSelectDetail(next.id);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedDetailId, customers, onSelectDetail]);

  if (isLoading) {
    // +2: leading checkbox column and trailing actions (columns menu) column.
    return <CustomersTableSkeleton columns={allColumns.length + 2} />;
  }

  if (customers.length === 0) {
    return null;
  }

  return (
    <div ref={tableRef} className="h-full w-full">
      <Table containerRef={scrollRef} containerClassName="h-full scrollbar-hide">
        <TableHeader className="sticky top-0 z-10 bg-background">
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-10 px-3">
                  <Checkbox
                    aria-label="Selecionar todos da página"
                    checked={
                      allInPageSelected ? true : partialPageSelected ? "indeterminate" : false
                    }
                    onCheckedChange={(checked) => onToggleAllInPage(Boolean(checked))}
                  />
                </TableHead>
                {allColumns.map((col) => {
                  const sortKey = COLUMN_SORT_KEY[col];
                  const isSorted = sortKey && sort.orderBy === sortKey;
                  return (
                    <TableHead
                      key={col}
                      onClick={() => handleHeaderClick(col)}
                      className={cn(
                        "select-none whitespace-nowrap text-xs font-semibold uppercase tracking-wide text-muted-foreground",
                        sortKey && "cursor-pointer hover:text-foreground",
                      )}
                    >
                      <span className="inline-flex items-center gap-1">
                        {COLUMN_LABELS[col]}
                        {sortKey && (
                          <Icon
                            icon={
                              isSorted
                                ? sort.orderDir === "asc"
                                  ? "mdi:chevron-up"
                                  : "mdi:chevron-down"
                                : "mdi:unfold-more-horizontal"
                            }
                            size={14}
                            className={cn(!isSorted && "opacity-40")}
                          />
                        )}
                      </span>
                    </TableHead>
                  );
                })}
                <TableHead className="w-10 px-1 text-right">
                  <CustomersColumnsDropdown
                    visible={visibleOptional}
                    onToggle={onToggleColumn}
                    onShowAll={onShowAllColumns}
                  />
                </TableHead>
              </TableRow>
            </ContextMenuTrigger>
            <CustomersColumnsContextContent
              visible={visibleOptional}
              onToggle={onToggleColumn}
              onShowAll={onShowAllColumns}
            />
          </ContextMenu>
        </TableHeader>
        <TableBody className={cn(isFetching && "opacity-60 transition-opacity")}>
          {customers.map((customer) => (
            <CustomerRow
              key={customer.id}
              customer={customer}
              columns={allColumns}
              isSelected={selectedIds.has(customer.id)}
              onToggleSelected={onToggleSelected}
              isFocused={selectedDetailId === customer.id}
              onSelectDetail={onSelectDetail}
              onOpenDetail={onOpenDetail}
              searchTerm={searchTerm}
              sellersById={sellersById}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

interface ICustomerRowProps {
  customer: ICustomer;
  columns: ColumnId[];
  isSelected: boolean;
  onToggleSelected: (id: ID, checked: boolean) => void;
  isFocused: boolean;
  onSelectDetail: (id: ID) => void;
  onOpenDetail: (id: ID) => void;
  searchTerm: string;
  sellersById: Map<ID, ISellerLookupEntry>;
}

function CustomerRow({
  customer,
  columns,
  isSelected,
  onToggleSelected,
  isFocused,
  onSelectDetail,
  onOpenDetail,
  searchTerm,
  sellersById,
}: ICustomerRowProps) {
  const display = getCustomerDisplay(customer);
  const name = getCustomerName(customer);
  const recencyDays = daysSince(customer.lastPurchaseAt);

  return (
    <TableRow
      data-selected={isFocused ? "true" : undefined}
      className={cn("cursor-pointer", isFocused && "bg-accent/40 hover:bg-accent/50")}
      onClick={() => onSelectDetail(customer.id)}
    >
      <TableCell className="w-10 px-3" onClick={(e) => e.stopPropagation()}>
        <Checkbox
          aria-label={`Selecionar ${name}`}
          checked={isSelected}
          onCheckedChange={(checked) => onToggleSelected(customer.id, Boolean(checked))}
        />
      </TableCell>
      {columns.map((col) => (
        <TableCell key={col} className="align-middle">
          {renderCell(col, {
            customer,
            display,
            name,
            recencyDays,
            searchTerm,
            sellersById,
            onOpenDetail,
          })}
        </TableCell>
      ))}
      <TableCell className="px-1" />
    </TableRow>
  );
}

interface ICellContext {
  customer: ICustomer;
  display: ReturnType<typeof getCustomerDisplay>;
  name: string;
  recencyDays: number | null;
  searchTerm: string;
  sellersById: Map<ID, ISellerLookupEntry>;
  onOpenDetail: (id: ID) => void;
}

function renderCell(col: ColumnId, ctx: ICellContext) {
  const { customer, display, name, recencyDays, searchTerm, sellersById, onOpenDetail } = ctx;
  switch (col) {
    case "name":
      return (
        <div className="flex items-center gap-3">
          <CustomerAvatar
            display={display}
            className="h-8 w-8 shrink-0 text-[11px]"
            iconSize={16}
          />
          <div className="min-w-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenDetail(customer.id);
              }}
              className="block max-w-full truncate text-left text-sm font-medium uppercase text-foreground transition-colors hover:text-primary hover:underline focus:outline-none focus:ring-2 focus:ring-ring"
              title={`Abrir página de ${name}`}
            >
              {highlightSearchTerm(name, searchTerm)}
            </button>
            <p className="truncate text-xs text-muted-foreground">
              {highlightSearchTerm(customer.phone, searchTerm)}
            </p>
          </div>
        </div>
      );
    case "type":
      return (
        <Badge variant="outline" className={cn("text-xs", TYPE_BADGE_CLASSES[customer.type])}>
          {TYPE_LABELS[customer.type]}
        </Badge>
      );
    case "abc": {
      if (!customer.abcClass) {
        return <span className="text-xs text-muted-foreground">—</span>;
      }
      return (
        <Badge variant="outline" className={cn("text-xs", ABC_BADGE_CLASSES[customer.abcClass])}>
          {customer.abcClass}
        </Badge>
      );
    }
    case "status":
      return (
        <Badge variant="outline" className={cn("text-xs", STATUS_BADGE_CLASSES[customer.status])}>
          {STATUS_LABELS[customer.status]}
        </Badge>
      );
    case "document": {
      const doc = customer.type === "B2B" ? formatCNPJ(customer.cnpj) : formatCPF(customer.cpf);
      return (
        <span className="text-xs tabular-nums text-foreground">
          {highlightSearchTerm(doc, searchTerm)}
        </span>
      );
    }
    case "seller": {
      const entry = sellersById.get(customer.sellerId);
      if (!entry) return <span className="text-xs text-muted-foreground">—</span>;
      return (
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="grid h-6 w-6 place-items-center rounded-full text-[10px] font-semibold"
            style={{ background: entry.bg, color: entry.fg }}
          >
            {entry.initials}
          </span>
          <span className="truncate text-xs text-foreground">{entry.name}</span>
        </div>
      );
    }
    case "ticketMedio":
      return (
        <span className="text-xs tabular-nums">
          {formatBRLCompact(customer.purchaseStats?.ticketMedio)}
        </span>
      );
    case "recency":
      return (
        <span
          className={cn(
            "text-xs tabular-nums",
            recencyDays !== null && recencyDays > 180 && "text-rose-600 dark:text-rose-400",
            recencyDays !== null && recencyDays > 60 && recencyDays <= 180
              ? "text-amber-600 dark:text-amber-400"
              : "",
          )}
        >
          {recencyDays === null ? "—" : `${recencyDays}d`}
        </span>
      );
    case "ltv":
      return (
        <span className="text-xs tabular-nums">
          {formatBRLCompact(customer.purchaseStats?.ltv)}
        </span>
      );
    case "tags": {
      const shown = customer.tags.slice(0, 3);
      const extra = customer.tags.length - shown.length;
      return (
        <div className="flex flex-wrap items-center gap-1">
          {shown.map((tag) => (
            <Badge
              key={tag}
              variant="outline"
              className="border-border bg-muted/50 text-[10px] text-muted-foreground"
            >
              {tag}
            </Badge>
          ))}
          {extra > 0 && <span className="text-[10px] text-muted-foreground">+{extra}</span>}
        </div>
      );
    }
    case "city":
      return <span className="text-xs text-foreground">{customer.address?.city ?? "—"}</span>;
    case "lastConversation":
      return (
        <span className="text-xs tabular-nums text-foreground">
          {formatDateBR(customer.lastPurchaseAt)}
        </span>
      );
    case "createdAt":
      return (
        <span className="text-xs tabular-nums text-foreground">
          {formatDateBR(customer.createdAt)}
        </span>
      );
  }
}

function CustomersTableSkeleton({ columns }: { columns: number }) {
  return (
    <div className="w-full px-3 py-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-border/60 py-3">
          <Skeleton className="h-4 w-4 rounded-sm" />
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-3 flex-1" />
          {Array.from({ length: Math.max(0, columns - 3) }).map((_, j) => (
            <Skeleton key={j} className="h-3 w-16" />
          ))}
        </div>
      ))}
    </div>
  );
}
