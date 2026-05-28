import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL, formatDateBR } from "@/shared/utils/format";
import { usePortalSession } from "../hooks/usePortalSession";
import { usePortalOrders } from "../hooks/usePortalResources";
import { PORTAL_STRINGS as S } from "../i18n/pt-BR";

export function PortalOrdersListPage() {
  const { customer } = usePortalSession();
  const { data: orders = [], isLoading } = usePortalOrders(customer?.id);

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold text-foreground">{S.ordersTitle}</h1>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <Card className="py-10 text-center text-sm text-muted-foreground">{S.ordersEmpty}</Card>
      ) : (
        <div className="space-y-2">
          {orders.map((o) => (
            <Link key={o.id} to="/portal/pedidos/$id" params={{ id: o.id }}>
              <Card className="flex items-center justify-between gap-3 p-4 transition-colors hover:border-primary/40">
                <div className="min-w-0">
                  <p className="font-mono text-xs font-semibold text-foreground">{o.number}</p>
                  <p className="text-xs text-muted-foreground">{formatDateBR(o.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{o.paymentStatus}</Badge>
                  <span className="text-sm font-semibold tabular-nums">{formatBRL(o.total)}</span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
