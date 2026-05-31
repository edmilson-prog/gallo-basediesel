import type { PointerEvent as ReactPointerEvent } from "react";
import type { ICustomer, ID, IQuote, ISeller } from "@/shared/types";
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
import { QuoteStatusBadge } from "../QuoteStatusBadge";
import { QuoteOriginBadge } from "../QuoteOriginBadge";
import { ValidityIndicator } from "../ValidityIndicator";
import { useResizableColumns } from "../../hooks/useResizableColumns";
import type { IQuotesListSort, QuoteOrderBy } from "../../utils/listFilters";

const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

const COLUMN_WIDTHS_KEY = "gallo-quotes-column-widths";

type QuoteColumnId =
  | "number"
  | "customer"
  | "origin"
  | "seller"
  | "total"
  | "status"
  | "createdAt"
  | "validUntil";

interface IQuoteColumnDef {
  id: QuoteColumnId;
  label: string;
  defaultWidth: number;
  sortBy: QuoteOrderBy;
  align?: "right";
}

const COLUMNS: readonly IQuoteColumnDef[] = [
  { id: "number", label: "Número", defaultWidth: 120, sortBy: "number" },
  { id: "customer", label: "Cliente", defaultWidth: 260, sortBy: "customer" },
  { id: "origin", label: "Origem", defaultWidth: 120, sortBy: "origin" },
  { id: "seller", label: "Vendedor", defaultWidth: 170, sortBy: "seller" },
  { id: "total", label: "Total", defaultWidth: 130, sortBy: "total", align: "right" },
  { id: "status", label: "Status", defaultWidth: 130, sortBy: "status" },
  { id: "createdAt", label: "Criado", defaultWidth: 110, sortBy: "createdAt" },
  { id: "validUntil", label: "Validade", defaultWidth: 140, sortBy: "validUntil" },
];

export interface IQuotesTableProps {
  quotes: IQuote[];
  isLoading: boolean;
  sort: IQuotesListSort;
  onSortChange: (sort: IQuotesListSort) => void;
  onRowClick: (id: ID) => void;
  sellers: Map<ID, ISeller>;
  customers: Map<ID, ICustomer>;
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

export function QuotesTable({
  quotes,
  isLoading,
  sort,
  onSortChange,
  onRowClick,
  sellers,
  customers,
}: IQuotesTableProps) {
  const { widths, totalWidth, startResize } = useResizableColumns(COLUMNS, COLUMN_WIDTHS_KEY);

  const toggleSort = (field: QuoteOrderBy) => {
    if (sort.orderBy !== field) {
      onSortChange({ orderBy: field, orderDir: "desc" });
    } else {
      onSortChange({ orderBy: field, orderDir: sort.orderDir === "asc" ? "desc" : "asc" });
    }
  };

  const SortHeader = ({ col }: { col: IQuoteColumnDef }) => {
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
        {col.label}
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

  if (isLoading && quotes.length === 0) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    );
  }

  return (
    <Table
      className="w-full table-fixed"
      containerClassName="h-full"
      style={{ minWidth: totalWidth }}
    >
      <colgroup>
        {COLUMNS.map((col) => (
          <col key={col.id} style={{ width: widths[col.id] }} />
        ))}
      </colgroup>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          {COLUMNS.map((col) => (
            <TableHead
              key={col.id}
              className={cn(
                "sticky top-0 z-20 bg-background",
                col.align === "right" && "text-right",
              )}
            >
              <SortHeader col={col} />
              <ResizeHandle onPointerDown={(e) => startResize(col.id, e)} />
            </TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {quotes.map((q) => {
          const customer = q.customerId ? customers.get(q.customerId) : undefined;
          const seller = sellers.get(q.sellerId);
          const sellerName = seller?.fullName ?? (q.sellerId === "sdr-agent" ? "Agente SDR" : "—");
          return (
            <TableRow
              key={q.id}
              className={cn("cursor-pointer transition-colors hover:bg-muted/60")}
              onClick={() => onRowClick(q.id)}
            >
              <TableCell className="truncate font-mono text-xs font-semibold text-foreground">
                #{q.number}
              </TableCell>
              <TableCell className="truncate text-sm uppercase text-foreground">
                {customerName(customer)}
              </TableCell>
              <TableCell>
                <QuoteOriginBadge origin={q.origin} size="sm" />
              </TableCell>
              <TableCell className="truncate text-sm text-muted-foreground">{sellerName}</TableCell>
              <TableCell className="text-right text-sm font-semibold tabular-nums">
                {moneyFormatter.format(q.total)}
              </TableCell>
              <TableCell>
                <QuoteStatusBadge status={q.status} size="sm" />
              </TableCell>
              <TableCell className="truncate text-xs text-muted-foreground">
                {dateFormatter.format(new Date(q.createdAt))}
              </TableCell>
              <TableCell>
                <ValidityIndicator validUntil={q.validUntil} />
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
