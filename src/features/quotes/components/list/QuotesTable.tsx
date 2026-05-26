import type { ICustomer, ID, IQuote, ISeller } from "@/shared/types";
import { cn } from "@/lib/utils";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { QuoteStatusBadge } from "../QuoteStatusBadge";
import { QuoteOriginBadge } from "../QuoteOriginBadge";
import { ValidityIndicator } from "../ValidityIndicator";
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

export function QuotesTable({
  quotes,
  isLoading,
  sort,
  onSortChange,
  onRowClick,
  sellers,
  customers,
}: IQuotesTableProps) {
  const toggleSort = (field: QuoteOrderBy) => {
    if (sort.orderBy !== field) {
      onSortChange({ orderBy: field, orderDir: "desc" });
    } else {
      onSortChange({ orderBy: field, orderDir: sort.orderDir === "asc" ? "desc" : "asc" });
    }
  };

  const SortHeader = ({ field, children }: { field: QuoteOrderBy; children: React.ReactNode }) => {
    const active = sort.orderBy === field;
    return (
      <button
        type="button"
        onClick={() => toggleSort(field)}
        className="inline-flex items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground"
      >
        {children}
        {active && (
          <Icon
            icon={sort.orderDir === "asc" ? "mdi:arrow-up" : "mdi:arrow-down"}
            size={12}
          />
        )}
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
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-32">Número</TableHead>
          <TableHead>Cliente</TableHead>
          <TableHead className="w-24">Origem</TableHead>
          <TableHead className="w-40">Vendedor</TableHead>
          <TableHead className="w-28 text-right">
            <SortHeader field="total">Total</SortHeader>
          </TableHead>
          <TableHead className="w-28">Status</TableHead>
          <TableHead className="w-24">
            <SortHeader field="createdAt">Criado</SortHeader>
          </TableHead>
          <TableHead className="w-28">
            <SortHeader field="validUntil">Validade</SortHeader>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {quotes.map((q) => {
          const customer = q.customerId ? customers.get(q.customerId) : undefined;
          const seller = sellers.get(q.sellerId);
          const sellerName =
            seller?.fullName ?? (q.sellerId === "sdr-agent" ? "Agente SDR" : "—");
          return (
            <TableRow
              key={q.id}
              className={cn("cursor-pointer transition-colors hover:bg-muted/60")}
              onClick={() => onRowClick(q.id)}
            >
              <TableCell className="font-mono text-xs font-semibold text-foreground">
                #{q.number}
              </TableCell>
              <TableCell className="text-sm">
                <span className="truncate text-foreground">{customerName(customer)}</span>
              </TableCell>
              <TableCell>
                <QuoteOriginBadge origin={q.origin} size="sm" />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{sellerName}</TableCell>
              <TableCell className="text-right text-sm font-semibold tabular-nums">
                {moneyFormatter.format(q.total)}
              </TableCell>
              <TableCell>
                <QuoteStatusBadge status={q.status} size="sm" />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
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
