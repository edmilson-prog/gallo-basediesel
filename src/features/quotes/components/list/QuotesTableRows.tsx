import type { ICustomer, ID, IQuote, ISeller } from "@/shared/types";
import { cn } from "@/lib/utils";
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
import { daysUntil, validityBucket } from "../../utils/quoteTotals";

const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function customerName(c: ICustomer | undefined): string {
  if (!c) return "—";
  return c.type === "B2B" ? c.nomeFantasia || c.razaoSocial : c.fullName;
}

function validityLabel(validUntil: string, now: Date): { text: string; className: string } {
  const bucket = validityBucket(validUntil, now);
  const days = daysUntil(validUntil, now);
  if (bucket === "expired") return { text: "vencido", className: "text-destructive" };
  if (bucket === "critical" || bucket === "warning") {
    return { text: `vence em ${days}d`, className: "text-amber-600 dark:text-amber-400" };
  }
  return { text: `válido · ${days}d`, className: "text-muted-foreground" };
}

export interface IQuotesTableRowsProps {
  quotes: IQuote[];
  isLoading: boolean;
  now: Date;
  onRowClick: (id: ID) => void;
  sellers: Map<ID, ISeller>;
  customers: Map<ID, ICustomer>;
}

/** Two-line ("comfortable") quote rows for the Rows layout — more context per row. */
export function QuotesTableRows({
  quotes,
  isLoading,
  now,
  onRowClick,
  sellers,
  customers,
}: IQuotesTableRowsProps) {
  if (isLoading && quotes.length === 0) {
    return (
      <div className="space-y-2 p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </div>
    );
  }

  return (
    <Table className="w-full">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Orçamento / Cliente</TableHead>
          <TableHead className="w-40">Origem / Vendedor</TableHead>
          <TableHead className="w-32 text-right">Total / Itens</TableHead>
          <TableHead className="w-44">Status / Validade</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {quotes.map((q) => {
          const customer = q.customerId ? customers.get(q.customerId) : undefined;
          const seller = sellers.get(q.sellerId);
          const sellerName = seller?.fullName ?? (q.sellerId === "sdr-agent" ? "Agente SDR" : "—");
          const city = customer?.address?.city;
          const validity = validityLabel(q.validUntil, now);
          return (
            <TableRow
              key={q.id}
              className="cursor-pointer transition-colors hover:bg-muted/60"
              onClick={() => onRowClick(q.id)}
            >
              <TableCell className="py-2.5">
                <div className="font-medium text-foreground">
                  <span className="font-mono text-xs text-muted-foreground">#{q.number}</span>{" "}
                  <span className="uppercase">{customerName(customer)}</span>
                </div>
                <div className="text-xs text-muted-foreground">{city ?? "—"}</div>
              </TableCell>
              <TableCell className="py-2.5">
                <QuoteOriginBadge origin={q.origin} size="sm" />
                <div className="mt-0.5 text-xs text-muted-foreground">{sellerName}</div>
              </TableCell>
              <TableCell className="py-2.5 text-right">
                <div className="font-semibold tabular-nums text-foreground">
                  {moneyFormatter.format(q.total)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {q.items.length} {q.items.length === 1 ? "item" : "itens"}
                </div>
              </TableCell>
              <TableCell className="py-2.5">
                <QuoteStatusBadge status={q.status} size="sm" />
                <div className={cn("mt-0.5 text-xs", validity.className)}>{validity.text}</div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
