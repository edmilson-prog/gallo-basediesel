import { useEffect, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { formatBRL } from "@/shared/utils/format";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { usePortalSession } from "../hooks/usePortalSession";
import { usePortalOrders } from "../hooks/usePortalResources";
import { PortalBanner } from "../components/PortalBanner";
import { PORTAL_STRINGS as S } from "../i18n/pt-BR";

export function PortalBillingPage() {
  const { user, customer } = usePortalSession();
  const { data: orders = [] } = usePortalOrders(customer?.id);

  // RF-044: financial access is sensitive — audit each visit (once per mount).
  const audited = useRef(false);
  useEffect(() => {
    if (audited.current || !customer) return;
    audited.current = true;
    auditLog({
      actorId: user?.id,
      action: "portal_billing_access",
      resource: "customer",
      resourceId: customer.id,
      storeId: "00000000-0000-0000-0000-000000000001",
    });
  }, [user?.id, customer]);

  const limit = customer?.portalContract?.creditLimit ?? 80_000;
  const used = orders
    .filter((o) => o.paymentStatus === "pendente" || o.paymentStatus === "parcial")
    .reduce((acc, o) => acc + o.total, 0);
  const available = Math.max(0, limit - used);

  const cards = [
    { label: S.billingLimit, value: formatBRL(limit), icon: "mdi:credit-card-outline" },
    { label: S.billingUsed, value: formatBRL(used), icon: "mdi:credit-card-clock-outline" },
    {
      label: S.billingAvailable,
      value: formatBRL(available),
      icon: "mdi:credit-card-check-outline",
    },
  ];

  return (
    <div className="space-y-4">
      <h1 className="font-display text-2xl font-semibold text-foreground">{S.billingTitle}</h1>
      <PortalBanner text="Sistema completo de faturamento corporativo disponível na Fase 2." />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.label} className="flex flex-col gap-1 p-4">
            <Icon icon={c.icon} size={18} className="text-muted-foreground" aria-hidden />
            <p className="text-xl font-semibold tabular-nums text-foreground">{c.value}</p>
            <p className="text-xs text-muted-foreground">{c.label}</p>
          </Card>
        ))}
      </div>

      <Card className="space-y-2 p-5">
        <p className="text-sm font-medium text-foreground">{S.billingInstallments}</p>
        <p className="text-sm text-muted-foreground">Nenhuma parcela em aberto no momento.</p>
      </Card>

      <Card className="space-y-2 p-5">
        <p className="text-sm font-medium text-foreground">{S.billingInvoices}</p>
        <p className="text-sm text-muted-foreground">
          As notas fiscais ficarão disponíveis para download na Fase 2.
        </p>
      </Card>
    </div>
  );
}
