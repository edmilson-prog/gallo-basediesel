import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/Icon";
import { FunnelChart } from "../charts/FunnelChart";
import type { IUseFunnelMetricsResult } from "../../hooks/useFunnelMetrics";
import { SALES_ANALYTICS_STRINGS as S } from "../../i18n/pt-BR";

export interface ISalesFunnelTabProps {
  funnel: IUseFunnelMetricsResult;
}

const STAGE_DESTINATIONS: Record<string, { to: string; label: string; icon: string }> = {
  leads: { to: "/app/leads", label: "Ver todos os leads", icon: "mdi:account-multiple-outline" },
  qualified: {
    to: "/app/leads",
    label: "Ver leads qualificados",
    icon: "mdi:account-check-outline",
  },
  quotes_sent: {
    to: "/app/orcamentos",
    label: "Ver orçamentos enviados",
    icon: "mdi:file-document-outline",
  },
  quotes_accepted: {
    to: "/app/orcamentos",
    label: "Ver orçamentos aceitos",
    icon: "mdi:file-check-outline",
  },
  orders_paid: { to: "/app/pedidos", label: "Ver pedidos pagos", icon: "mdi:cart-check" },
};

export function SalesFunnelTab({ funnel }: ISalesFunnelTabProps) {
  return (
    <div className="flex flex-col gap-4">
      <FunnelChart
        stages={funnel.stages}
        bottleneckIndex={funnel.bottleneckIndex}
        isLoading={funnel.isLoading}
      />

      <Card className="flex flex-col gap-3 p-5">
        <h3 className="text-base font-semibold tracking-tight text-foreground">
          Aprofundar por etapa
        </h3>
        <p className="text-xs text-muted-foreground">
          Clique em uma etapa para abrir a lista completa correspondente.
        </p>
        <ul className="flex flex-col gap-1">
          {funnel.stages.map((stage) => {
            const dest = STAGE_DESTINATIONS[stage.id];
            if (!dest) return null;
            return (
              <li key={stage.id}>
                <Link
                  to={dest.to}
                  className="flex items-center justify-between gap-3 rounded-md px-3 py-2 text-sm transition-colors hover:bg-muted/40"
                >
                  <span className="flex items-center gap-2">
                    <Icon icon={dest.icon} size={16} className="text-muted-foreground" />
                    <span className="text-foreground">{dest.label}</span>
                  </span>
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    {stage.count.toLocaleString("pt-BR")}
                    <Icon icon="mdi:arrow-right" size={14} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <p className="text-[11px] text-muted-foreground">{S.funnelSampleLink}</p>
      </Card>
    </div>
  );
}
