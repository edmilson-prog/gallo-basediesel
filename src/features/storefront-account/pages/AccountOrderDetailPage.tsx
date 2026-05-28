import { useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import type { IOrderItem } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { Link } from "@tanstack/react-router";
import { OrderStatusBadge } from "@/features/orders/components/OrderStatusBadge";
import { computeOrderStatus } from "@/features/orders/utils/orderStatus";
import { useOrdersProvider } from "@/providers/data/hooks/useOrdersProvider";
import { useCartStore, type ICartItem } from "@/features/storefront/store/cartStore";
import { useStorefrontSettings } from "@/features/storefront/hooks/useStorefrontSettings";
import { useSeoMeta } from "@/features/storefront/hooks/useSeoMeta";
import { formatBRL, formatDateBR } from "@/shared/utils/format";
import { useCustomerAuth } from "../hooks/useCustomerAuth";
import { STOREFRONT_ACCOUNT_STRINGS as S } from "../i18n/pt-BR";

export interface IAccountOrderDetailPageProps {
  orderId: string;
}

export function AccountOrderDetailPage({ orderId }: IAccountOrderDetailPageProps) {
  const { customer } = useCustomerAuth();
  const navigate = useNavigate();
  const ordersProvider = useOrdersProvider();
  const addItem = useCartStore((s) => s.addItem);
  const { config } = useStorefrontSettings();

  const orderQuery = useQuery({
    queryKey: ["customer-account", "order-detail", orderId] as const,
    staleTime: 30_000,
    queryFn: () => ordersProvider.get(orderId),
    retry: false,
  });

  useSeoMeta({ title: `Pedido ${orderQuery.data?.number ?? orderId} · GALLO PARTS` });

  if (orderQuery.isLoading) {
    return (
      <div className="space-y-3">
        <div className="h-32 animate-pulse rounded-lg border border-border bg-muted/40" />
        <div className="h-48 animate-pulse rounded-lg border border-border bg-muted/40" />
      </div>
    );
  }

  if (!orderQuery.data) {
    return <NotFound message={S.orderDetailNotFound} />;
  }

  const order = orderQuery.data;
  if (customer && order.customerId !== customer.id) {
    return <NotFound message={S.orderDetailNotYours} />;
  }

  const status = computeOrderStatus(order);

  const handleRepeat = () => {
    order.items.forEach((it) => {
      const cartItem: ICartItem = {
        partId: it.partId,
        partName: it.partName,
        partSku: it.partSku,
        unitPrice: it.unitPrice,
        quantity: it.quantity,
      };
      addItem(cartItem);
    });
    toast.success(S.orderDetailRepeatToast);
    void navigate({ to: "/loja/carrinho" });
  };

  const handleWhatsapp = () => {
    const phone = (config.footer.whatsapp ?? "").replace(/\D/g, "");
    if (!phone) {
      toast.error("WhatsApp da loja não configurado.");
      return;
    }
    const message = encodeURIComponent(
      S.orderDetailWhatsAppMessage(order.number ?? order.id.slice(-6)),
    );
    window.open(`https://wa.me/55${phone}?text=${message}`, "_blank", "noopener");
  };

  const itemsCount = order.items.reduce((acc, it) => acc + it.quantity, 0);

  return (
    <div className="space-y-5">
      <div>
        <Button asChild variant="ghost" size="sm">
          <Link to="/loja/conta/pedidos">
            <Icon icon="mdi:arrow-left" size={14} className="mr-1" aria-hidden />
            {S.orderDetailBack}
          </Link>
        </Button>
      </div>

      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <h1 className="font-display text-xl font-semibold text-foreground sm:text-2xl">
              {order.number ?? `Pedido ${order.id.slice(-6)}`}
            </h1>
            <p className="text-xs text-muted-foreground">
              Realizado em {formatDateBR(order.createdAt)} · {S.ordersCardItems(itemsCount)}
            </p>
          </div>
          <OrderStatusBadge status={status} />
        </div>
        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={handleRepeat}>
            <Icon icon="mdi:cart-plus" size={16} className="mr-2" aria-hidden />
            {S.orderDetailRepeatCta}
          </Button>
          <Button variant="outline" onClick={handleWhatsapp}>
            <Icon icon="mdi:whatsapp" size={16} className="mr-2" aria-hidden />
            {S.orderDetailWhatsAppCta}
          </Button>
        </div>
      </Card>

      <Card className="space-y-3 p-5">
        <h2 className="text-sm font-semibold text-foreground">{S.orderDetailItems}</h2>
        <ul className="divide-y divide-border">
          {order.items.map((item) => (
            <OrderItemRow key={item.id} item={item} />
          ))}
        </ul>
      </Card>

      <div className="grid gap-5 sm:grid-cols-2">
        <Card className="space-y-2 p-5">
          <h2 className="text-sm font-semibold text-foreground">{S.orderDetailAddress}</h2>
          {order.deliveryAddress ? (
            <div className="space-y-0.5 text-sm text-muted-foreground">
              <p>
                {order.deliveryAddress.street}, {order.deliveryAddress.number}
                {order.deliveryAddress.complement ? ` — ${order.deliveryAddress.complement}` : ""}
              </p>
              <p>
                {order.deliveryAddress.district} · {order.deliveryAddress.city}/
                {order.deliveryAddress.state}
              </p>
              <p>CEP {order.deliveryAddress.zipCode}</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{S.orderDetailNoAddress}</p>
          )}
        </Card>

        <Card className="space-y-2 p-5">
          <h2 className="text-sm font-semibold text-foreground">{S.orderDetailPayment}</h2>
          <dl className="grid gap-1 text-sm">
            <Row
              label={S.orderDetailPayment}
              value={order.paymentMethod ?? order.paymentCondition ?? "—"}
            />
            <Row label={S.orderDetailPaymentStatus} value={order.paymentStatus} />
            <Row label={S.orderDetailFulfillmentStatus} value={order.fulfillmentStatus} />
          </dl>
        </Card>
      </div>

      <Card className="space-y-2 p-5">
        <h2 className="text-sm font-semibold text-foreground">{S.orderDetailTotals}</h2>
        <dl className="grid gap-1 text-sm">
          <Row label="Subtotal" value={formatBRL(order.subtotal)} />
          <Row label="Frete" value={formatBRL(order.shipping)} />
          {order.discount > 0 && <Row label="Desconto" value={`- ${formatBRL(order.discount)}`} />}
          <Row label="Total" value={formatBRL(order.total)} bold />
        </dl>
      </Card>
    </div>
  );
}

function OrderItemRow({ item }: { item: IOrderItem }) {
  return (
    <li className="flex items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-foreground">{item.partName}</p>
        <p className="text-xs text-muted-foreground">
          SKU {item.partSku} · {item.quantity}x {formatBRL(item.unitPrice)}
        </p>
      </div>
      <p className="text-sm font-semibold text-foreground">{formatBRL(item.total)}</p>
    </li>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={bold ? "text-base font-semibold text-foreground" : "text-foreground"}>
        {value}
      </dd>
    </div>
  );
}

function NotFound({ message }: { message: string }) {
  return (
    <Card className="flex flex-col items-center gap-3 p-10 text-center">
      <Icon icon="mdi:alert-circle-outline" size={32} className="text-muted-foreground" />
      <p className="text-sm text-foreground">{message}</p>
      <Button asChild variant="outline" size="sm">
        <Link to="/loja/conta/pedidos">
          <Icon icon="mdi:arrow-left" size={14} className="mr-1" aria-hidden />
          {S.orderDetailBack}
        </Link>
      </Button>
    </Card>
  );
}
