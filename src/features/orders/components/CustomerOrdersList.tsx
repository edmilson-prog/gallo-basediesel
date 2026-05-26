import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { ID, IOrder } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useOrdersProvider } from "@/providers/data/hooks/useOrdersProvider";
import { OrderStatusBadge } from "./OrderStatusBadge";
import { OrderOriginBadge } from "./OrderOriginBadge";
import { computeOrderStatus } from "../utils/orderStatus";

const moneyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const dateFormatter = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "2-digit",
});

type PeriodFilter = "30d" | "90d" | "12m" | "all";

const FILTERS: { value: PeriodFilter; label: string; days: number | null }[] = [
  { value: "30d", label: "30 dias", days: 30 },
  { value: "90d", label: "90 dias", days: 90 },
  { value: "12m", label: "12 meses", days: 365 },
  { value: "all", label: "Todos", days: null },
];

const PAGE_SIZE = 10;

/**
 * Drop-in component for the customer profile (PRD-012) "Pedidos" tab.
 * Lists every order of the given customer with period filters and pagination,
 * surfacing the PRD-032 aggregated status badge.
 */
export function CustomerOrdersList({ customerId }: { customerId: ID }) {
  const provider = useOrdersProvider();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PeriodFilter>("12m");
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["customer-orders", customerId] as const,
    queryFn: () => provider.listByCustomer(customerId),
    staleTime: 60_000,
  });

  const filtered = useMemo<IOrder[]>(() => {
    const all = query.data ?? [];
    const cfg = FILTERS.find((f) => f.value === period);
    if (!cfg?.days) return all;
    const cutoff = new Date(Date.now() - cfg.days * 24 * 60 * 60 * 1000).toISOString();
    return all.filter((o) => o.createdAt >= cutoff);
  }, [query.data, period]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const visible = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  const handlePeriodChange = (next: PeriodFilter) => {
    setPeriod(next);
    setPage(1);
  };

  return (
    <div className="space-y-3">
      <header className="flex items-center gap-2">
        <Icon icon="mdi:clipboard-list-outline" size={16} className="text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">Pedidos do cliente</h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length > 0
            ? `${visible.length} de ${filtered.length}`
            : null}
        </span>
      </header>

      <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Período">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            role="radio"
            aria-checked={period === f.value}
            onClick={() => handlePeriodChange(f.value)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-[11px] transition focus:outline-none focus:ring-2 focus:ring-ring",
              period === f.value
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {query.isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 p-6 text-center">
          <Icon icon="mdi:cart-off" size={32} className="text-muted-foreground" />
          <p className="text-sm font-medium text-foreground">Sem pedidos no período</p>
          <p className="text-xs text-muted-foreground">
            Conversões de orçamento e aceites do SDR aparecem aqui automaticamente.
          </p>
        </div>
      ) : (
        <>
          <ul className="space-y-1.5">
            {visible.map((order) => {
              const agg = computeOrderStatus(order);
              return (
                <li key={order.id}>
                  <button
                    type="button"
                    onClick={() =>
                      void navigate({
                        to: "/app/pedidos/$id",
                        params: { id: order.id },
                      })
                    }
                    className="flex w-full items-center justify-between gap-3 rounded-md border border-border bg-card p-3 text-left transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-foreground">
                          #{order.number ?? order.id.replace(/^order-/, "PD-")}
                        </span>
                        <OrderStatusBadge status={agg} size="sm" />
                        <OrderOriginBadge order={order} size="sm" />
                      </div>
                      <p className="mt-1 text-[11px] text-muted-foreground">
                        {order.items.length}{" "}
                        {order.items.length === 1 ? "item" : "itens"} · criado em{" "}
                        {dateFormatter.format(new Date(order.createdAt))}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold tabular-nums text-foreground">
                        {moneyFormatter.format(order.total)}
                      </p>
                      {order.nfNumber && (
                        <p className="text-[10px] text-muted-foreground">NF #{order.nfNumber}</p>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 border-t border-border pt-2 text-xs">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <Icon icon="mdi:chevron-left" size={14} />
                Anterior
              </Button>
              <span className="text-muted-foreground">
                Página {currentPage} de {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                Próxima
                <Icon icon="mdi:chevron-right" size={14} />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
