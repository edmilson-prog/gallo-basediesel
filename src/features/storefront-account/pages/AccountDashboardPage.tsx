import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useSeoMeta } from "@/features/storefront/hooks/useSeoMeta";
import { useVehiclesProvider } from "@/providers/data/hooks/useVehiclesProvider";
import { computeOrderStatus } from "@/features/orders/utils/orderStatus";
import { useCustomerAuth } from "../hooks/useCustomerAuth";
import { useCustomerOrders } from "../hooks/useCustomerOrders";
import { useCustomerQuotes } from "../hooks/useCustomerQuotes";
import { useCustomerAuthStore } from "../store/customerAuthStore";
import { STOREFRONT_ACCOUNT_STRINGS as S } from "../i18n/pt-BR";

export function AccountDashboardPage() {
  const { customer } = useCustomerAuth();
  const ordersQuery = useCustomerOrders(customer?.id);
  const quotesQuery = useCustomerQuotes(customer?.id);
  const vehiclesProvider = useVehiclesProvider();
  const savedAddresses = useCustomerAuthStore((s) =>
    customer ? (s.savedAddresses[customer.id] ?? []) : [],
  );

  const vehiclesQuery = useQuery({
    queryKey: ["customer-account", "vehicles", customer?.id] as const,
    enabled: Boolean(customer && customer.type === "B2B"),
    staleTime: 60_000,
    queryFn: () => (customer ? vehiclesProvider.listByCustomer(customer.id) : Promise.resolve([])),
  });

  useSeoMeta({ title: "Minha conta · GALLO PARTS" });

  const orderStats = useMemo(() => {
    const orders = ordersQuery.data ?? [];
    const active = orders.filter((o) => {
      const status = computeOrderStatus(o);
      return ["aguardando_pagamento", "pago_aguardando_envio", "em_separacao", "enviado"].includes(
        status,
      );
    }).length;
    return { total: orders.length, active };
  }, [ordersQuery.data]);

  const quoteStats = useMemo(() => {
    const quotes = quotesQuery.data ?? [];
    const pending = quotes.filter((q) => q.status === "enviado").length;
    return { total: quotes.length, pending };
  }, [quotesQuery.data]);

  if (!customer) return null;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          {S.accountGreet(customer.type === "B2B" ? customer.nomeFantasia : customer.fullName)}
        </h1>
        <p className="text-sm text-muted-foreground">{S.accountSubtitle}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <SummaryCard
          icon="mdi:clipboard-list-outline"
          title={S.dashboardCardOrdersTitle}
          subtitle={
            orderStats.active > 0
              ? S.dashboardCardOrdersActiveSubtitle(orderStats.active)
              : S.dashboardCardOrdersSubtitle(orderStats.total)
          }
          cta={S.dashboardCardOrdersCta}
          to="/loja/conta/pedidos"
          highlight={String(orderStats.total)}
        />
        <SummaryCard
          icon="mdi:file-document-outline"
          title={S.dashboardCardQuotesTitle}
          subtitle={
            quoteStats.pending > 0
              ? S.dashboardCardQuotesActiveSubtitle(quoteStats.pending)
              : S.dashboardCardQuotesSubtitle(quoteStats.total)
          }
          cta={S.dashboardCardQuotesCta}
          to="/loja/conta/orcamentos"
          highlight={String(quoteStats.total)}
        />
        <SummaryCard
          icon="mdi:account-circle-outline"
          title={S.dashboardCardProfileTitle}
          subtitle={S.dashboardCardProfileSubtitle}
          cta={S.dashboardCardProfileCta}
          to="/loja/conta/perfil"
        />
        <SummaryCard
          icon="mdi:map-marker-outline"
          title={S.dashboardCardAddressesTitle}
          subtitle={S.dashboardCardAddressesSubtitle(savedAddresses.length)}
          cta={S.dashboardCardAddressesCta}
          to="/loja/conta/enderecos"
          highlight={String(savedAddresses.length)}
        />
        {customer.type === "B2B" && (
          <SummaryCard
            icon="mdi:truck-outline"
            title={S.dashboardCardVehiclesTitle}
            subtitle={S.dashboardCardVehiclesSubtitle(vehiclesQuery.data?.length ?? 0)}
            cta={S.dashboardCardVehiclesCta}
            to="/loja/conta/veiculos"
            highlight={String(vehiclesQuery.data?.length ?? 0)}
          />
        )}
      </div>
    </div>
  );
}

interface ISummaryCardProps {
  icon: string;
  title: string;
  subtitle: string;
  cta: string;
  to: string;
  highlight?: string;
}

function SummaryCard({ icon, title, subtitle, cta, to, highlight }: ISummaryCardProps) {
  return (
    <Card className="flex flex-col gap-3 p-5 transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-primary">
          <Icon icon={icon} size={20} aria-hidden />
        </span>
        {highlight && (
          <span className="font-display text-2xl font-semibold text-foreground">{highlight}</span>
        )}
      </div>
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        <p className="text-xs text-muted-foreground">{subtitle}</p>
      </div>
      <Button asChild variant="outline" size="sm" className="mt-auto w-full">
        <Link to={to}>
          {cta}
          <Icon icon="mdi:arrow-right" size={14} className="ml-1" aria-hidden />
        </Link>
      </Button>
    </Card>
  );
}
