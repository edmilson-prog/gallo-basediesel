import type {
  ICustomer,
  ID,
  IOrder,
  ISeller,
  OrderFulfillmentStatus,
  OrderPaymentStatus,
} from "@/shared/types";
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

const moneyFormatter = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const PAYMENT_SHORT: Record<OrderPaymentStatus, string> = {
  pendente: "Pgto pendente",
  parcial: "Pgto parcial",
  pago: "Pago",
  estornado: "Estornado",
  vencido: "Pgto vencido",
};
const FULFILL_SHORT: Record<OrderFulfillmentStatus, string> = {
  pendente: "a separar",
  separacao: "em separação",
  expedido: "expedido",
  entregue: "entregue",
  cancelado: "cancelado",
  devolvido: "devolvido",
};

function customerName(c: ICustomer | undefined): string {
  if (!c) return "—";
  return c.type === "B2B" ? c.nomeFantasia || c.razaoSocial : c.fullName;
}

export interface IOrdersTableRowsProps {
  orders: IOrder[];
  isLoading: boolean;
  onRowClick: (id: ID) => void;
  sellers: Map<ID, ISeller>;
  customers: Map<ID, ICustomer>;
}

/** Two-line ("comfortable") order rows for the Rows layout — more context per row. */
export function OrdersTableRows({
  orders,
  isLoading,
  onRowClick,
  sellers,
  customers,
}: IOrdersTableRowsProps) {
  if (isLoading && orders.length === 0) {
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
          <TableHead>Pedido / Cliente</TableHead>
          <TableHead className="w-40">Origem / Vendedor</TableHead>
          <TableHead className="w-32 text-right">Total / Itens</TableHead>
          <TableHead className="w-52">Status / Pagamento</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {orders.map((o) => {
          const customer = customers.get(o.customerId);
          const seller = sellers.get(o.sellerId);
          const sellerName = seller?.fullName ?? (o.sellerId === "sdr-agent" ? "Agente SDR" : "—");
          const city = customer?.address?.city;
          const aggregate = computeOrderStatus(o);
          const number = o.number ?? o.id.replace(/^order-/, "PD-");
          return (
            <TableRow
              key={o.id}
              className="cursor-pointer transition-colors hover:bg-muted/60"
              onClick={() => onRowClick(o.id)}
            >
              <TableCell className="py-2.5">
                <div className="font-medium text-foreground">
                  <span className="font-mono text-xs text-muted-foreground">#{number}</span>{" "}
                  <span className="uppercase">{customerName(customer)}</span>
                </div>
                <div className="text-xs text-muted-foreground">{city ?? "—"}</div>
              </TableCell>
              <TableCell className="py-2.5">
                <OrderOriginBadge order={o} size="sm" />
                <div className="mt-0.5 text-xs text-muted-foreground">{sellerName}</div>
              </TableCell>
              <TableCell className="py-2.5 text-right">
                <div className="font-semibold tabular-nums text-foreground">
                  {moneyFormatter.format(o.total)}
                </div>
                <div className="text-xs text-muted-foreground">
                  {o.items.length} {o.items.length === 1 ? "item" : "itens"}
                </div>
              </TableCell>
              <TableCell className="py-2.5">
                <OrderStatusBadge status={aggregate} size="sm" />
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {PAYMENT_SHORT[o.paymentStatus]} · {FULFILL_SHORT[o.fulfillmentStatus]}
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
