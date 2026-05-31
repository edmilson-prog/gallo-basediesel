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
import { OrderStatusBadge } from "../OrderStatusBadge";
import { OrderOriginBadge } from "../OrderOriginBadge";
import { computeOrderStatus } from "../../utils/orderStatus";
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

export interface IOrdersTableProps {
  orders: IOrder[];
  isLoading: boolean;
  sort: IOrdersListSort;
  onSortChange: (sort: IOrdersListSort) => void;
  onRowClick: (id: ID) => void;
  sellers: Map<ID, ISeller>;
  customers: Map<ID, ICustomer>;
}

function customerName(c: ICustomer | undefined): string {
  if (!c) return "—";
  if (c.type === "B2B") return c.nomeFantasia || c.razaoSocial;
  return c.fullName;
}

export function OrdersTable({
  orders,
  isLoading,
  sort,
  onSortChange,
  onRowClick,
  sellers,
  customers,
}: IOrdersTableProps) {
  const toggleSort = (field: OrderOrderBy) => {
    if (sort.orderBy !== field) {
      onSortChange({ orderBy: field, orderDir: "desc" });
    } else {
      onSortChange({ orderBy: field, orderDir: sort.orderDir === "asc" ? "desc" : "asc" });
    }
  };

  const SortHeader = ({
    field,
    align,
    children,
  }: {
    field: OrderOrderBy;
    align?: "right";
    children: React.ReactNode;
  }) => {
    const active = sort.orderBy === field;
    return (
      <button
        type="button"
        onClick={() => toggleSort(field)}
        className={cn(
          "inline-flex w-full items-center gap-1 text-xs font-medium uppercase tracking-wide text-muted-foreground hover:text-foreground",
          align === "right" && "justify-end",
        )}
      >
        {children}
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

  return (
    <Table containerClassName="h-full">
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead className="sticky top-0 z-20 w-32 bg-background">
            <SortHeader field="number">Número</SortHeader>
          </TableHead>
          <TableHead className="sticky top-0 z-20 bg-background">
            <SortHeader field="customer">Cliente</SortHeader>
          </TableHead>
          <TableHead className="sticky top-0 z-20 w-24 bg-background">
            <SortHeader field="origin">Origem</SortHeader>
          </TableHead>
          <TableHead className="sticky top-0 z-20 w-40 bg-background">
            <SortHeader field="seller">Vendedor</SortHeader>
          </TableHead>
          <TableHead className="sticky top-0 z-20 w-28 bg-background text-right">
            <SortHeader field="total" align="right">
              Total
            </SortHeader>
          </TableHead>
          <TableHead className="sticky top-0 z-20 w-44 bg-background">
            <SortHeader field="status">Status</SortHeader>
          </TableHead>
          <TableHead className="sticky top-0 z-20 w-24 bg-background">
            <SortHeader field="createdAt">Data</SortHeader>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((o) => {
          const customer = customers.get(o.customerId);
          const seller = sellers.get(o.sellerId);
          const sellerName = seller?.fullName ?? (o.sellerId === "sdr-agent" ? "Agente SDR" : "—");
          const aggregate = computeOrderStatus(o);
          return (
            <TableRow
              key={o.id}
              className={cn("cursor-pointer transition-colors hover:bg-muted/60")}
              onClick={() => onRowClick(o.id)}
            >
              <TableCell className="font-mono text-xs font-semibold text-foreground">
                #{o.number ?? o.id.replace(/^order-/, "PD-")}
              </TableCell>
              <TableCell className="text-sm">
                <span className="truncate text-foreground">{customerName(customer)}</span>
              </TableCell>
              <TableCell>
                <OrderOriginBadge order={o} size="sm" />
              </TableCell>
              <TableCell className="text-sm text-muted-foreground">{sellerName}</TableCell>
              <TableCell className="text-right text-sm font-semibold tabular-nums">
                {moneyFormatter.format(o.total)}
              </TableCell>
              <TableCell>
                <OrderStatusBadge status={aggregate} size="sm" />
              </TableCell>
              <TableCell className="text-xs text-muted-foreground">
                {dateFormatter.format(new Date(o.createdAt))}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
