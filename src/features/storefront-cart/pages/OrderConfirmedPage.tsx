import { Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { useOrdersProvider } from "@/providers/data";
import { useSeoMeta } from "@/features/storefront/hooks/useSeoMeta";
import { formatBRL } from "@/shared/utils/format";
import { STOREFRONT_CART_STRINGS as S } from "../i18n/pt-BR";

const ROUTE_ID = "/loja/pedido-confirmado/$orderId" as const;
const STALE_MS = 60 * 1000;

/**
 * `/loja/pedido-confirmado/:orderId` — success page rendered right after
 * `createOrderFromCart` resolves (PRD-064 RF-033–037).
 */
export function OrderConfirmedPage() {
  const { orderId } = useParams({ from: ROUTE_ID });
  const ordersProvider = useOrdersProvider();

  const orderQuery = useQuery({
    queryKey: ["storefront-cart", "order", orderId] as const,
    queryFn: () => ordersProvider.get(orderId),
    staleTime: STALE_MS,
    retry: false,
  });

  useSeoMeta({
    title: "Pedido confirmado · GALLO PARTS",
    description: "Seu pedido foi registrado com sucesso na GALLO PARTS.",
  });

  if (orderQuery.isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (orderQuery.isError || !orderQuery.data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:py-14">
        <Card className="space-y-3 border-destructive/40 bg-destructive/10 p-6 text-center">
          <Icon icon="mdi:alert-circle-outline" size={28} className="mx-auto text-destructive" />
          <p className="text-sm text-destructive">Não localizamos esse pedido.</p>
          <Button asChild variant="outline">
            <Link to="/loja">Voltar para a loja</Link>
          </Button>
        </Card>
      </div>
    );
  }

  const order = orderQuery.data;

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-10 sm:py-14">
      <Card className="space-y-4 border-primary/30 bg-primary/5 p-8 text-center">
        <span className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-primary/15 text-primary">
          <Icon icon="mdi:check-bold" size={32} aria-hidden />
        </span>
        <div className="space-y-1">
          <h1 className="font-display text-2xl font-semibold text-foreground sm:text-3xl">
            {S.confirmTitle}
          </h1>
          <p className="text-sm text-muted-foreground">
            {S.confirmSubtitle(order.number ?? order.id)}
          </p>
        </div>
        <p className="mx-auto max-w-md text-sm text-muted-foreground">{S.confirmBody}</p>
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          <Button asChild>
            <Link to="/loja/conta">
              <Icon icon="mdi:account-circle-outline" size={14} className="mr-1" aria-hidden />
              {S.confirmAccountCta}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/loja">
              <Icon icon="mdi:storefront-outline" size={14} className="mr-1" aria-hidden />
              {S.confirmStoreCta}
            </Link>
          </Button>
        </div>
      </Card>

      <Card className="space-y-4 p-6">
        <h2 className="text-base font-semibold text-foreground">Resumo do pedido</h2>
        <ul className="divide-y divide-border rounded-md border border-border">
          {order.items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <p className="line-clamp-1 font-medium text-foreground">{item.partName}</p>
                <p className="text-xs text-muted-foreground">
                  {item.quantity} × {formatBRL(item.unitPrice)}
                </p>
              </div>
              <span className="font-medium text-foreground">{formatBRL(item.total)}</span>
            </li>
          ))}
        </ul>
        <div className="space-y-1 border-t border-border pt-3 text-sm">
          <Row label="Subtotal" value={formatBRL(order.subtotal)} />
          <Row label="Frete" value={formatBRL(order.shipping)} />
          <Row label="Total" value={formatBRL(order.total)} strong />
        </div>
      </Card>

      <Card className="flex items-start gap-3 border-amber-500/40 bg-amber-500/10 p-4">
        <Icon
          icon="mdi:test-tube"
          size={18}
          className="mt-0.5 text-amber-700 dark:text-amber-300"
          aria-hidden
        />
        <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-200">
          {S.confirmDemoBanner}
        </p>
      </Card>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={strong ? "font-semibold text-foreground" : "text-muted-foreground"}>
        {label}
      </span>
      <span
        className={strong ? "text-base font-semibold text-primary" : "font-medium text-foreground"}
      >
        {value}
      </span>
    </div>
  );
}
