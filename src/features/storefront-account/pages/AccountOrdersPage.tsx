import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import type { IOrder } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { OrderStatusBadge } from "@/features/orders/components/OrderStatusBadge";
import { computeOrderStatus } from "@/features/orders/utils/orderStatus";
import { formatBRL, formatDateBR } from "@/shared/utils/format";
import { useSeoMeta } from "@/features/storefront/hooks/useSeoMeta";
import { useCustomerAuth } from "../hooks/useCustomerAuth";
import { useCustomerOrders } from "../hooks/useCustomerOrders";
import { STOREFRONT_ACCOUNT_STRINGS as S } from "../i18n/pt-BR";

type OrderFilter = "all" | "active" | "done" | "canceled";

const ACTIVE_STATUSES = [
  "aguardando_pagamento",
  "pago_aguardando_envio",
  "em_separacao",
  "enviado",
] as const;

export function AccountOrdersPage() {
  const { customer } = useCustomerAuth();
  const ordersQuery = useCustomerOrders(customer?.id);
  const [filter, setFilter] = useState<OrderFilter>("all");

  useSeoMeta({ title: "Meus pedidos · GALLO PARTS" });

  const orders = ordersQuery.data ?? [];
  const filtered = useMemo(() => {
    if (filter === "all") return orders;
    return orders.filter((order) => {
      const status = computeOrderStatus(order);
      if (filter === "active") return (ACTIVE_STATUSES as readonly string[]).includes(status);
      if (filter === "done") return status === "entregue" || status === "concluido";
      if (filter === "canceled") return status === "cancelado" || status === "devolvido";
      return true;
    });
  }, [orders, filter]);

  return (
    <div className="space-y-5">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
          {S.ordersTitle}
        </h1>
        <p className="text-sm text-muted-foreground">{S.ordersSubtitle}</p>
      </header>

      <div className="flex flex-wrap gap-2">
        <FilterChip
          label={S.ordersFilterAll}
          active={filter === "all"}
          onClick={() => setFilter("all")}
        />
        <FilterChip
          label={S.ordersFilterActive}
          active={filter === "active"}
          onClick={() => setFilter("active")}
        />
        <FilterChip
          label={S.ordersFilterDone}
          active={filter === "done"}
          onClick={() => setFilter("done")}
        />
        <FilterChip
          label={S.ordersFilterCanceled}
          active={filter === "canceled"}
          onClick={() => setFilter("canceled")}
        />
      </div>

      {ordersQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-lg border border-border bg-muted/40"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <Icon icon="mdi:package-variant" size={36} className="text-muted-foreground" />
          <div>
            <p className="text-base font-semibold text-foreground">{S.ordersEmptyTitle}</p>
            <p className="mt-1 text-sm text-muted-foreground">{S.ordersEmptyHint}</p>
          </div>
          <Button asChild variant="default">
            <Link to="/loja">{S.ordersEmptyCta}</Link>
          </Button>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border text-muted-foreground hover:bg-muted/60"
      }`}
    >
      {label}
    </button>
  );
}

function OrderCard({ order }: { order: IOrder }) {
  const status = computeOrderStatus(order);
  const itemsCount = order.items.reduce((acc, it) => acc + it.quantity, 0);
  return (
    <Card className="flex flex-col gap-3 p-4 transition-shadow hover:shadow-md sm:flex-row sm:items-center sm:justify-between">
      <div className="flex-1 space-y-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-sm font-semibold text-foreground">
            {order.number ?? `Pedido ${order.id.slice(-6)}`}
          </p>
          <OrderStatusBadge status={status} size="sm" />
        </div>
        <p className="text-xs text-muted-foreground">
          {S.ordersCardDate}: {formatDateBR(order.createdAt)} · {S.ordersCardItems(itemsCount)}
        </p>
        <p className="text-sm font-semibold text-foreground">
          {S.ordersCardTotal}: {formatBRL(order.total)}
        </p>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link to="/loja/conta/pedidos/$id" params={{ id: order.id }}>
          {S.ordersCardCta}
          <Icon icon="mdi:arrow-right" size={14} className="ml-1" aria-hidden />
        </Link>
      </Button>
    </Card>
  );
}
