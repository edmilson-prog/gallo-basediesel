import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import type { ICustomer, IGoal, IOrder } from "@/shared/types";
import { FETCH_ALL_PAGE_SIZE, useCustomersProvider, useOrdersProvider } from "@/providers/data";
import { formatBRL, formatDateBR } from "@/shared/utils/format";
import { GOALS_STRINGS as S } from "../../i18n/pt-BR";
import {
  getAcquiredCustomers,
  getContributingOrders,
  getPositivatedCustomers,
  getTicketStats,
} from "../../utils/composition";

const STALE_MS = 30_000;

export interface IGoalCompositionSectionProps {
  goal: IGoal;
}

function customerName(customer: ICustomer): string {
  if (customer.type === "B2B") return customer.nomeFantasia || customer.razaoSocial;
  return customer.fullName;
}

export function GoalCompositionSection({ goal }: IGoalCompositionSectionProps) {
  const ordersProvider = useOrdersProvider();
  const customersProvider = useCustomersProvider();

  // Shared key family with useGoalProgress / GoalEvolutionChart — identical
  // fetch params, so React Query dedups the detail-page requests.
  const scopeSellerId = goal.level === "individual" ? goal.targetId : undefined;

  const queries = useQueries({
    queries: [
      {
        queryKey: ["goals-scope-orders", goal.storeId, scopeSellerId],
        queryFn: () =>
          ordersProvider.list({
            storeId: goal.storeId,
            sellerId: scopeSellerId,
            paymentStatus: "pago",
            pageSize: FETCH_ALL_PAGE_SIZE,
          }),
        staleTime: STALE_MS,
      },
      {
        queryKey: ["goals-scope-customers", goal.storeId],
        queryFn: () =>
          customersProvider.list({ storeId: goal.storeId, pageSize: FETCH_ALL_PAGE_SIZE }),
        staleTime: STALE_MS,
      },
    ],
  });

  const [ordersQuery, customersQuery] = queries;
  const isLoading = ordersQuery.isLoading || customersQuery.isLoading;

  const orders = useMemo(() => ordersQuery.data?.data ?? [], [ordersQuery.data]);
  const customers = useMemo(() => customersQuery.data?.data ?? [], [customersQuery.data]);

  const contributingOrders = useMemo(() => getContributingOrders(goal, orders), [goal, orders]);

  const customerById = useMemo(() => {
    const map = new Map<string, ICustomer>();
    for (const c of customers) map.set(c.id, c);
    return map;
  }, [customers]);

  if (isLoading) {
    return (
      <Card className="flex flex-col gap-3 p-5">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-32 w-full" />
      </Card>
    );
  }

  return (
    <Card className="flex flex-col gap-4 p-5">
      <header className="flex items-baseline justify-between">
        <h2 className="text-base font-semibold tracking-tight text-foreground">
          {S.detailCompositionTitle}
        </h2>
        <Icon icon="mdi:format-list-bulleted" size={20} className="text-muted-foreground" />
      </header>

      {goal.metric === "novos_clientes" ? (
        <NewCustomersList customers={getAcquiredCustomers(goal, customers)} />
      ) : goal.metric === "positivacao" ? (
        <PositivatedCustomersList
          customerIds={getPositivatedCustomers(goal, orders)}
          customerById={customerById}
        />
      ) : goal.metric === "ticket_medio" ? (
        <TicketStatsSection orders={contributingOrders} />
      ) : (
        <OrdersList orders={contributingOrders} />
      )}
    </Card>
  );
}

function OrdersList({ orders }: { orders: IOrder[] }) {
  if (orders.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">Sem pedidos no período.</p>
    );
  }
  const limited = orders.slice(0, 20);
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {S.detailCompositionOrders} ({orders.length})
      </p>
      <ul className="divide-y divide-border/40">
        {limited.map((o) => (
          <li key={o.id}>
            <Link
              to="/app/pedidos/$id"
              params={{ id: o.id }}
              className="flex items-center justify-between gap-3 py-2 text-sm transition-colors hover:bg-muted/40"
            >
              <div className="flex flex-col">
                <span className="font-medium text-foreground">{o.number ?? o.id}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDateBR(o.paidAt ?? o.createdAt)}
                </span>
              </div>
              <span className="font-mono font-medium text-foreground">{formatBRL(o.total)}</span>
            </Link>
          </li>
        ))}
      </ul>
      {orders.length > limited.length && (
        <p className="text-[11px] text-muted-foreground">
          Mostrando {limited.length} de {orders.length}.
        </p>
      )}
    </div>
  );
}

function PositivatedCustomersList({
  customerIds,
  customerById,
}: {
  customerIds: string[];
  customerById: Map<string, ICustomer>;
}) {
  if (customerIds.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Sem clientes positivados no período.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {S.detailCompositionCustomers} ({customerIds.length})
      </p>
      <ul className="divide-y divide-border/40">
        {customerIds.slice(0, 25).map((id) => {
          const customer = customerById.get(id);
          if (!customer) return null;
          return (
            <li key={id}>
              <Link
                to="/app/clientes/$id"
                params={{ id }}
                className="flex items-center justify-between gap-3 py-2 text-sm transition-colors hover:bg-muted/40"
              >
                <span className="font-medium text-foreground">{customerName(customer)}</span>
                <Icon icon="mdi:chevron-right" size={14} className="text-muted-foreground" />
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function NewCustomersList({ customers }: { customers: ICustomer[] }) {
  if (customers.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        Sem novos clientes no período.
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {S.detailCompositionNewCustomers} ({customers.length})
      </p>
      <ul className="divide-y divide-border/40">
        {customers.slice(0, 25).map((c) => (
          <li key={c.id}>
            <Link
              to="/app/clientes/$id"
              params={{ id: c.id }}
              className="flex items-center justify-between gap-3 py-2 text-sm transition-colors hover:bg-muted/40"
            >
              <div className="flex flex-col">
                <span className="font-medium text-foreground">{customerName(c)}</span>
                <span className="text-xs text-muted-foreground">{formatDateBR(c.createdAt)}</span>
              </div>
              <Icon icon="mdi:chevron-right" size={14} className="text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function TicketStatsSection({ orders }: { orders: IOrder[] }) {
  const stats = getTicketStats(orders);
  if (stats.count === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">Sem pedidos no período.</p>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">
        {S.detailCompositionTicketStats} ({stats.count} pedidos)
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCell label="Mínimo" value={formatBRL(stats.min)} />
        <StatCell label="Mediana" value={formatBRL(stats.median)} />
        <StatCell label="Máximo" value={formatBRL(stats.max)} />
        <StatCell label="Desvio" value={formatBRL(stats.std)} />
      </div>
    </div>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col rounded-md border border-border bg-muted/30 p-3">
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}
