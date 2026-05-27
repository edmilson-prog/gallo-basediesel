import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { CsaHeader } from "../components/CsaHeader";
import { OverviewTab } from "../components/OverviewTab";
import { ChannelTab } from "../components/ChannelTab";
import { SellerTab } from "../components/SellerTab";
import { EscalationsTab } from "../components/EscalationsTab";
import { useCustomerServiceMetrics } from "../hooks/useCustomerServiceMetrics";
import { useCsaFilters, type CsaTab } from "../hooks/useCsaFilters";
import { CSA_STRINGS as S } from "../i18n/pt-BR";

const ALLOWED_ROLES = new Set(["Owner", "Gestor", "Financeiro"]);

function buildMonthOptions(monthCount = 18, now: Date = new Date()): string[] {
  const out: string[] = [];
  for (let i = 0; i < monthCount; i += 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/**
 * `/app/gestao/atendimento-analise` — Customer Service Analytics (PRD-051).
 *
 * Histórico estratégico (diferente do PRD-014 operacional). Quatro abas:
 * visão geral, por canal, por vendedor (com drill-down), escalações SDR.
 */
export function CustomerServiceAnalyticsPage() {
  const { userRole } = useAuth();
  const { currentStore } = useCurrentStore();
  const storeId = currentStore?.id ?? "store-matriz";
  const filters = useCsaFilters();

  const { metrics, sellers, isLoading, isError } = useCustomerServiceMetrics({
    storeId,
    monthKey: filters.state.monthKey,
    sellerId: filters.state.sellerId,
  });

  const monthOptions = useMemo(() => buildMonthOptions(18), []);

  if (!userRole || !ALLOWED_ROLES.has(userRole)) {
    return (
      <EmptyState
        icon="mdi:shield-lock-outline"
        title={S.blockedTitle}
        description={S.blockedDescription}
        actionLabel="Voltar ao início"
        actionTo="/app/inicio"
      />
    );
  }

  return (
    <div className="space-y-6">
      <CsaHeader
        monthKey={filters.state.monthKey}
        monthOptions={monthOptions}
        onMonthKeyChange={filters.setMonthKey}
        sellers={sellers}
        sellerId={filters.state.sellerId}
        onSellerChange={filters.setSellerId}
      />

      {isError && (
        <Card className="border-destructive/40 bg-destructive/10 p-4 text-sm">
          <Icon
            icon="mdi:alert-circle-outline"
            size={18}
            className="mr-2 inline align-text-bottom text-destructive"
          />
          Não foi possível carregar a análise de atendimento.
        </Card>
      )}

      {isLoading || !metrics ? (
        <div className="space-y-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : metrics.totals.totalConversations === 0 ? (
        <Card className="p-10 text-center">
          <Icon icon="mdi:inbox-outline" size={36} className="mx-auto text-muted-foreground" />
          <p className="mt-3 text-sm text-muted-foreground">
            Nenhuma conversa no período selecionado.
          </p>
        </Card>
      ) : (
        <Tabs value={filters.state.tab} onValueChange={(v) => filters.setTab(v as CsaTab)}>
          <TabsList className="w-full justify-start sm:w-auto">
            <TabsTrigger value="overview">{S.tabOverview}</TabsTrigger>
            <TabsTrigger value="channel">{S.tabChannel}</TabsTrigger>
            <TabsTrigger value="seller">{S.tabSeller}</TabsTrigger>
            <TabsTrigger value="escalations">{S.tabEscalations}</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="mt-5">
            <OverviewTab metrics={metrics} />
          </TabsContent>
          <TabsContent value="channel" className="mt-5">
            <ChannelTab metrics={metrics} />
          </TabsContent>
          <TabsContent value="seller" className="mt-5">
            <SellerTab metrics={metrics} />
          </TabsContent>
          <TabsContent value="escalations" className="mt-5">
            <EscalationsTab metrics={metrics} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
