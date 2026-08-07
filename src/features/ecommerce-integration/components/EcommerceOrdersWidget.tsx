import { Link } from "@tanstack/react-router";
import type { ID } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBRL } from "@/shared/utils/format";
import { useEcommerceOrdersSummary } from "../hooks/useEcommerceOrdersSummary";

export interface IEcommerceOrdersWidgetProps {
  storeId: ID;
}

/**
 * "Pedidos via E-commerce" widget for the Painel Gestor (PRD-067 RF-018).
 * Click leads to the order list filtered by e-commerce origin.
 */
export function EcommerceOrdersWidget({ storeId }: IEcommerceOrdersWidgetProps) {
  const { data, isLoading } = useEcommerceOrdersSummary(storeId);

  return (
    <Card className="flex flex-col gap-3 p-5">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Icon icon="mdi:cart" size={18} aria-hidden />
          </span>
          <h3 className="text-sm font-semibold text-foreground">Pedidos via E-commerce</h3>
        </div>
        <Link
          to="/app/pedidos"
          search={{ origins: "ecommerce" }}
          className="text-xs text-primary hover:underline"
        >
          Ver todos
        </Link>
      </header>

      {isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : (
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {data?.periodCount ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">Últimos 30 dias</p>
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums text-severity-warning">
              {data?.pendingCount ?? 0}
            </p>
            <p className="text-xs text-muted-foreground">Pendentes</p>
          </div>
          <div>
            <p className="text-2xl font-semibold tabular-nums text-foreground">
              {formatBRL(data?.periodRevenue ?? 0)}
            </p>
            <p className="text-xs text-muted-foreground">Receita (30d)</p>
          </div>
        </div>
      )}
    </Card>
  );
}
