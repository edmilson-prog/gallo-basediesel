import { Link, useParams, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBRL, formatDateBR, formatPhone } from "@/shared/utils/format";
import {
  useConversationsProvider,
  useCustomersProvider,
  useOrdersProvider,
  useQuotesProvider,
  useVehiclesProvider,
} from "@/providers/data";
import { customerLabel } from "../utils/customerLabel";
import { PWA_STRINGS as S } from "../i18n/pt-BR";

export function PWACustomerDetailPage() {
  const { id } = useParams({ from: "/pwa/carteira/$id" });
  const navigate = useNavigate();
  const customersProvider = useCustomersProvider();
  const ordersProvider = useOrdersProvider();
  const quotesProvider = useQuotesProvider();
  const vehiclesProvider = useVehiclesProvider();
  const conversationsProvider = useConversationsProvider();

  const customerQuery = useQuery({
    queryKey: ["pwa", "customer", id] as const,
    queryFn: () => customersProvider.get(id),
  });
  const ordersQuery = useQuery({
    queryKey: ["pwa", "customer-orders", id] as const,
    queryFn: () => ordersProvider.listByCustomer(id),
  });
  const quotesQuery = useQuery({
    queryKey: ["pwa", "customer-quotes", id] as const,
    queryFn: async () => (await quotesProvider.list({ customerId: id, pageSize: 50 })).data,
  });
  const vehiclesQuery = useQuery({
    queryKey: ["pwa", "customer-vehicles", id] as const,
    queryFn: () => vehiclesProvider.listByCustomer(id),
  });
  const conversationsQuery = useQuery({
    queryKey: ["pwa", "customer-conversations", id] as const,
    queryFn: async () => (await conversationsProvider.list({ customerId: id, pageSize: 50 })).data,
  });

  const customer = customerQuery.data;

  return (
    <div className="space-y-4">
      <Link to="/pwa/carteira" className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Icon icon="mdi:chevron-left" size={14} aria-hidden />
        {S.detailBack}
      </Link>

      {customerQuery.isLoading || !customer ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <Card className="space-y-2 p-4">
          <h1 className="font-display text-lg font-semibold text-foreground">
            {customerLabel(customer)}
          </h1>
          <div className="flex flex-col gap-1 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Icon icon="mdi:phone" size={14} aria-hidden />
              {formatPhone(customer.phone)}
            </span>
            {customer.email && (
              <span className="flex items-center gap-1.5">
                <Icon icon="mdi:email-outline" size={14} aria-hidden />
                {customer.email}
              </span>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 pt-2">
            <Button asChild size="sm">
              <Link to="/pwa/orcamento-rapido" search={{ customerId: customer.id }}>
                <Icon icon="mdi:file-document-plus" size={16} className="mr-1" aria-hidden />
                {S.detailNewQuote}
              </Link>
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void navigate({ to: "/pwa/agenda/nova", search: { customerId: customer.id } })
              }
            >
              <Icon icon="mdi:calendar-plus" size={16} className="mr-1" aria-hidden />
              {S.detailScheduleVisit}
            </Button>
          </div>
        </Card>
      )}

      <Tabs defaultValue="orders">
        <TabsList className="w-full">
          <TabsTrigger value="orders" className="flex-1">
            {S.tabOrders}
          </TabsTrigger>
          <TabsTrigger value="quotes" className="flex-1">
            {S.tabQuotes}
          </TabsTrigger>
          <TabsTrigger value="vehicles" className="flex-1">
            {S.tabVehicles}
          </TabsTrigger>
          <TabsTrigger value="conversations" className="flex-1">
            {S.tabConversations}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="space-y-2">
          {(ordersQuery.data ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Sem pedidos.</p>
          ) : (
            (ordersQuery.data ?? []).map((o) => (
              <Card key={o.id} className="flex items-center justify-between p-3">
                <div>
                  <p className="font-mono text-xs font-semibold text-foreground">{o.number}</p>
                  <p className="text-xs text-muted-foreground">{formatDateBR(o.createdAt)}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums">{formatBRL(o.total)}</span>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="quotes" className="space-y-2">
          {(quotesQuery.data ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Sem orçamentos.</p>
          ) : (
            (quotesQuery.data ?? []).map((q) => (
              <Card key={q.id} className="flex items-center justify-between p-3">
                <div>
                  <p className="font-mono text-xs font-semibold text-foreground">{q.number}</p>
                  <p className="text-xs text-muted-foreground">{q.status}</p>
                </div>
                <span className="text-sm font-semibold tabular-nums">{formatBRL(q.total)}</span>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="vehicles" className="space-y-2">
          {(vehiclesQuery.data ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Sem veículos.</p>
          ) : (
            (vehiclesQuery.data ?? []).map((v) => (
              <Card key={v.id} className="flex items-center gap-3 p-3">
                <Icon icon="mdi:truck" size={20} className="text-muted-foreground" aria-hidden />
                <div>
                  <p className="text-sm font-medium text-foreground">
                    {v.brand} {v.model} {v.year}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {v.plate ?? "sem placa"} · {v.engine}
                  </p>
                </div>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="conversations" className="space-y-2">
          {(conversationsQuery.data ?? []).length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">Sem conversas.</p>
          ) : (
            (conversationsQuery.data ?? []).map((c) => (
              <Card key={c.id} className="flex items-center justify-between gap-3 p-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-sm font-medium capitalize text-foreground">
                    <Icon icon="mdi:chat-outline" size={16} className="text-muted-foreground" aria-hidden />
                    {c.channel}
                  </p>
                  <p className="text-xs text-muted-foreground">{formatDateBR(c.lastMessageAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {c.unreadCount > 0 && (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                      {c.unreadCount}
                    </span>
                  )}
                  <span className="text-xs capitalize text-muted-foreground">{c.status}</span>
                </div>
              </Card>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
