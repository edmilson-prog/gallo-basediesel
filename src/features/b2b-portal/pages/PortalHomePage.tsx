import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { formatBRL } from "@/shared/utils/format";
import { usePortalSession } from "../hooks/usePortalSession";
import { usePortalOrders, usePortalVehicles } from "../hooks/usePortalResources";
import { usePortalStore } from "../store/portalStore";
import { PortalBanner } from "../components/PortalBanner";
import { PORTAL_STRINGS as S } from "../i18n/pt-BR";

function startOfMonth(): number {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
}

export function PortalHomePage() {
  const { user, customer } = usePortalSession();
  const { data: orders = [] } = usePortalOrders(customer?.id);
  const { data: vehicles = [] } = usePortalVehicles(customer?.id);
  const requests = usePortalStore((s) => s.requests).filter((r) => r.customerId === customer?.id);

  const openOrders = orders.filter(
    (o) => o.fulfillmentStatus !== "entregue" && o.fulfillmentStatus !== "cancelado",
  ).length;
  const monthStart = startOfMonth();
  const spendMonth = orders
    .filter((o) => o.paymentStatus === "pago" && Date.parse(o.paidAt ?? o.createdAt) >= monthStart)
    .reduce((acc, o) => acc + o.total, 0);
  const inMaintenance = vehicles.filter((v) => v.cadastroStatus === "pendente").length;
  const pendingRequests = requests.filter(
    (r) => r.status === "aberta" || r.status === "orcada",
  ).length;
  const creditLimit = customer?.portalContract?.creditLimit ?? 80_000;

  const kpis = [
    {
      label: S.kpiOrdersOpen,
      value: String(openOrders),
      icon: "mdi:package-variant",
      tone: "text-foreground",
    },
    {
      label: S.kpiSpendMonth,
      value: formatBRL(spendMonth),
      icon: "mdi:cash",
      tone: "text-foreground",
    },
    {
      label: S.kpiFleet,
      value: String(vehicles.length),
      icon: "mdi:truck",
      tone: "text-foreground",
    },
    {
      label: S.kpiRequestsPending,
      value: String(pendingRequests),
      icon: "mdi:clipboard-alert-outline",
      tone: "text-amber-600 dark:text-amber-400",
    },
    {
      label: S.kpiCredit,
      value: formatBRL(creditLimit),
      icon: "mdi:credit-card-outline",
      tone: "text-foreground",
    },
  ];

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-semibold text-foreground">
          {customer
            ? customer.type === "B2B"
              ? customer.nomeFantasia || customer.razaoSocial
              : customer.fullName
            : "Painel"}
        </h1>
        <p className="text-sm text-muted-foreground">Olá, {user?.name ?? "—"}</p>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) => (
          <Card key={k.label} className="flex flex-col gap-1 p-4">
            <Icon icon={k.icon} size={18} className="text-muted-foreground" aria-hidden />
            <p className={`text-xl font-semibold tabular-nums ${k.tone}`}>{k.value}</p>
            <p className="text-[11px] text-muted-foreground">{k.label}</p>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {user?.canCreateRequests && (
          <Button asChild className="h-12">
            <Link to="/portal/solicitacoes/nova">
              <Icon icon="mdi:plus" size={18} className="mr-1.5" aria-hidden />
              {S.shortcutNewRequest}
            </Link>
          </Button>
        )}
        <Button asChild variant="outline" className="h-12">
          <Link to="/portal/frota">
            <Icon icon="mdi:truck-plus" size={18} className="mr-1.5" aria-hidden />
            {S.shortcutAddVehicle}
          </Link>
        </Button>
        <Button asChild variant="outline" className="h-12">
          <Link to="/portal/suporte">
            <Icon icon="mdi:headset" size={18} className="mr-1.5" aria-hidden />
            {S.shortcutSupport}
          </Link>
        </Button>
      </div>

      <PortalBanner />
    </div>
  );
}
