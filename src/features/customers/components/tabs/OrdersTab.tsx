import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import type { ICustomer, IOrder } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { cn } from "@/lib/utils";
import { useOrdersProvider } from "@/providers/data/hooks/useOrdersProvider";
import { formatBRL, formatDateBR } from "@/shared/utils/format";
import { CUSTOMER_STRINGS } from "../../i18n/pt-BR";
import { TabSkeleton } from "../TabSkeleton";
import { TabEmptyState } from "../TabEmptyState";

const COPY = CUSTOMER_STRINGS.orders;
const PAGE_SIZE = 10;

type PeriodFilter = "30d" | "90d" | "12m" | "all";

const FILTERS: { value: PeriodFilter; label: string; days: number | null }[] = [
  { value: "30d", label: COPY.filter.d30, days: 30 },
  { value: "90d", label: COPY.filter.d90, days: 90 },
  { value: "12m", label: COPY.filter.m12, days: 365 },
  { value: "all", label: COPY.filter.all, days: null },
];

const PAYMENT_TONE: Record<IOrder["paymentStatus"], string> = {
  pago: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  parcial: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  pendente: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
  estornado: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

const FULFILLMENT_TONE: Record<IOrder["fulfillmentStatus"], string> = {
  entregue: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
  expedido: "bg-sky-500/15 text-sky-700 dark:text-sky-300",
  separacao: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  pendente: "bg-zinc-500/15 text-zinc-700 dark:text-zinc-300",
  cancelado: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
};

const PAYMENT_LABEL: Record<IOrder["paymentStatus"], string> = {
  pago: "Pago",
  parcial: "Parcial",
  pendente: "Pendente",
  estornado: "Estornado",
};

const FULFILLMENT_LABEL: Record<IOrder["fulfillmentStatus"], string> = {
  entregue: "Entregue",
  expedido: "Expedido",
  separacao: "Em separação",
  pendente: "Pendente",
  cancelado: "Cancelado",
};

export interface IOrdersTabProps {
  customer: ICustomer;
}

export function OrdersTab({ customer }: IOrdersTabProps) {
  const provider = useOrdersProvider();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PeriodFilter>("12m");
  const [page, setPage] = useState(1);

  const query = useQuery({
    queryKey: ["customer-orders", customer.id] as const,
    staleTime: 60 * 1000,
    queryFn: () => provider.listByCustomer(customer.id),
  });

  const filtered = useMemo(() => {
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
        <Icon icon="mdi:cart-outline" size={16} className="text-muted-foreground" />
        <h3 className="text-sm font-semibold text-foreground">{COPY.title}</h3>
        <span className="ml-auto text-xs text-muted-foreground">
          {filtered.length > 0 ? COPY.pageLabel(visible.length, filtered.length) : null}
        </span>
      </header>

      <div
        className="flex flex-wrap items-center gap-1.5"
        role="radiogroup"
        aria-label={COPY.filter.label}
      >
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
        <TabSkeleton rows={5} />
      ) : filtered.length === 0 ? (
        <TabEmptyState icon="mdi:cart-off" message={COPY.empty} />
      ) : (
        <>
          <ul className="space-y-1.5">
            {visible.map((order) => (
              <li key={order.id}>
                <button
                  type="button"
                  onClick={() => void navigate({ to: `/app/pedidos/${order.id}` as never })}
                  className="block w-full rounded-md border border-border bg-background p-2.5 text-left transition hover:border-primary/50 hover:bg-accent/40 focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="font-mono text-xs font-semibold text-foreground">
                      #{order.id.replace(/^order-/, "OP-")}
                    </span>
                    <span className="text-xs font-semibold text-foreground">
                      {formatBRL(order.total)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span>{formatDateBR(order.createdAt)}</span>
                    <span>{COPY.summary(order.items.length)}</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                        PAYMENT_TONE[order.paymentStatus],
                      )}
                    >
                      {PAYMENT_LABEL[order.paymentStatus]}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                        FULFILLMENT_TONE[order.fulfillmentStatus],
                      )}
                    >
                      {FULFILLMENT_LABEL[order.fulfillmentStatus]}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>

          {totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 pt-1">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="gap-1"
              >
                <Icon icon="mdi:chevron-left" size={14} />
                Anterior
              </Button>
              <span className="text-xs text-muted-foreground">
                Página {currentPage} de {totalPages}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
                className="gap-1"
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
