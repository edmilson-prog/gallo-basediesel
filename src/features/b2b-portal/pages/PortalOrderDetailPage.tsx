import { Link, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL, formatDateBR } from "@/shared/utils/format";
import { useOrdersProvider } from "@/providers/data";
import { PortalBanner } from "../components/PortalBanner";
import { PORTAL_STRINGS as S } from "../i18n/pt-BR";

export function PortalOrderDetailPage() {
  const { id } = useParams({ from: "/portal/pedidos/$id" });
  const provider = useOrdersProvider();
  const { data: order, isLoading } = useQuery({
    queryKey: ["portal", "order", id] as const,
    queryFn: () => provider.get(id),
  });

  if (isLoading || !order) {
    return <Skeleton className="h-48 w-full" />;
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <Link
        to="/portal/pedidos"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground"
      >
        <Icon icon="mdi:chevron-left" size={14} aria-hidden />
        {S.ordersTitle}
      </Link>

      <Card className="space-y-2 p-5">
        <div className="flex items-center justify-between">
          <h1 className="font-mono text-xl font-bold text-foreground">{order.number}</h1>
          <Badge variant="outline">{order.paymentStatus}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">{formatDateBR(order.createdAt)}</p>
      </Card>

      <Card className="space-y-2 p-4">
        <p className="text-sm font-medium text-foreground">Itens</p>
        <div className="space-y-1 text-sm">
          {order.items.map((it) => (
            <div key={it.id} className="flex justify-between">
              <span className="truncate text-foreground">
                {it.quantity}× {it.partName}
              </span>
              <span className="shrink-0 tabular-nums">{formatBRL(it.total)}</span>
            </div>
          ))}
        </div>
        <div className="flex justify-between border-t border-border pt-2 text-base font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatBRL(order.total)}</span>
        </div>
      </Card>

      <Card className="space-y-1 p-4 text-sm">
        <p className="font-medium text-foreground">{S.orderApprovalInfo}</p>
        <p className="text-xs text-muted-foreground">
          {order.nfNumber ? `NF ${order.nfNumber}` : "Nota fiscal pendente"}
          {" · "}
          {order.paymentCondition}
        </p>
      </Card>

      <PortalBanner text="Repetir pedido e download de NF disponíveis na Fase 2." />
      <Button variant="outline" disabled className="w-full">
        <Icon icon="mdi:repeat" size={16} className="mr-1" aria-hidden />
        {S.orderRepeat}
      </Button>
    </div>
  );
}
