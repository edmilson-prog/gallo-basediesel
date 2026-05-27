import { useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { toast } from "sonner";
import type { ICommission } from "@/shared/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { DashboardLayout } from "@/features/shell/layouts";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { useSellersProvider, useCommissionsProvider } from "@/providers/data";
import { useQuery } from "@tanstack/react-query";
import { useCommissionsList } from "../hooks/useCommissionsList";
import { useCommissionsFilters } from "../hooks/useCommissionsFilters";
import { CommissionsHeader } from "../components/CommissionsHeader";
import { CommissionsMyOrdersTable } from "../components/CommissionsMyOrdersTable";
import { CommissionsKpiGrid } from "../components/CommissionsKpiGrid";
import { ResolveDisputeDialog } from "../components/ResolveDisputeDialog";
import { COMMISSIONS_STRINGS as S } from "../i18n/pt-BR";
import { labelForPeriod, previousPeriod } from "../utils/periods";

const ALLOWED_ROLES = new Set(["Owner", "Gestor", "Vendedor", "Financeiro"]);

/**
 * Drill-down (`/app/gestao/comissoes/$sellerId`) — PRD-047.
 *
 * Lists all commissions of the seller in the period and allows the manager /
 * owner to resolve open disputes and the financeiro role to mark commissions
 * as paid.
 */
export function SellerCommissionsPage() {
  const navigate = useNavigate();
  const { sellerId } = useParams({ from: "/app/gestao/comissoes/$sellerId" });
  const { userRole, currentUser } = useAuth();
  const { currentStore } = useCurrentStore();
  const storeId = currentStore?.id ?? "store-matriz";
  const commissionsProvider = useCommissionsProvider();
  const sellersProvider = useSellersProvider();

  const filtersCtl = useCommissionsFilters({
    sellerLockedId: userRole === "Vendedor" ? currentUser?.sellerId : undefined,
  });

  const list = useCommissionsList({
    storeId,
    period: filtersCtl.filters.period,
    sellerId,
    enabled: ALLOWED_ROLES.has(userRole ?? ""),
  });
  const prev = useCommissionsList({
    storeId,
    period: previousPeriod(filtersCtl.filters.period),
    sellerId,
    enabled: ALLOWED_ROLES.has(userRole ?? ""),
  });

  const sellerQuery = useQuery({
    queryKey: ["seller", sellerId],
    queryFn: async () => {
      const all = await sellersProvider.list({ storeId });
      return all.find((s) => s.id === sellerId) ?? null;
    },
    enabled: ALLOWED_ROLES.has(userRole ?? ""),
    staleTime: 60_000,
  });

  const [resolving, setResolving] = useState<ICommission | null>(null);

  const totals = useMemo(() => {
    let baseCommission = 0;
    let goalBonus = 0;
    let total = 0;
    let paid = 0;
    let approved = 0;
    let calculated = 0;
    let disputed = 0;
    for (const c of list.data) {
      baseCommission += c.baseCommission;
      goalBonus += c.goalBonus;
      total += c.totalCommission;
      if (c.status === "paid") paid += c.totalCommission;
      if (c.status === "approved") approved += c.totalCommission;
      if (c.status === "calculated") calculated += c.totalCommission;
      if (c.status === "disputed") disputed += c.totalCommission;
    }
    return {
      orderCount: list.data.length,
      baseCommission,
      goalBonus,
      total,
      paid,
      approved,
      calculated,
      disputed,
    };
  }, [list.data]);

  const previousTotal = useMemo(
    () => prev.data.reduce((sum, c) => sum + c.totalCommission, 0),
    [prev.data],
  );
  const previousDeltaPct = previousTotal === 0 ? 0 : (totals.total - previousTotal) / previousTotal;

  if (!userRole || !ALLOWED_ROLES.has(userRole)) {
    return (
      <DashboardLayout>
        <EmptyState
          icon="mdi:shield-lock-outline"
          title="Acesso restrito"
          description="Esta tela é visível apenas para vendedores, gestores, owner e financeiro."
          actionLabel="Voltar"
          actionTo="/app/inicio"
        />
      </DashboardLayout>
    );
  }

  // Vendedor só pode ver as suas
  if (userRole === "Vendedor" && currentUser?.sellerId !== sellerId) {
    return (
      <DashboardLayout>
        <EmptyState
          icon="mdi:shield-lock-outline"
          title="Acesso restrito"
          description="Você só pode visualizar as suas próprias comissões."
          actionLabel="Voltar para minhas comissões"
          actionTo="/app/gestao/comissoes"
        />
      </DashboardLayout>
    );
  }

  const handleResolve = async (resolution: string, finalStatus: "approved" | "canceled") => {
    if (!resolving || !currentUser) return;
    try {
      const updated = await commissionsProvider.resolveDispute({
        commissionId: resolving.id,
        resolution,
        actorId: currentUser.id,
        finalStatus,
      });
      auditLog({
        action: "commission.dispute_resolve",
        resource: "commission",
        resourceId: resolving.id,
        before: { status: resolving.status, disputeReason: resolving.disputeReason },
        after: { status: updated.status, resolution, finalStatus },
        storeId: resolving.storeId,
      });
      toast.success("Disputa resolvida.");
      list.refetch();
      setResolving(null);
    } catch {
      toast.error("Não foi possível resolver a disputa.");
    }
  };

  const handleRegisterPayment = async (commission: ICommission) => {
    if (!currentUser) return;
    try {
      const updated = await commissionsProvider.registerPayment({
        commissionId: commission.id,
        paidBy: currentUser.id,
      });
      auditLog({
        action: "commission.pay",
        resource: "commission",
        resourceId: commission.id,
        before: { status: commission.status },
        after: { status: updated.status, paidAt: updated.paidAt },
        storeId: commission.storeId,
      });
      toast.success("Pagamento registrado.");
      list.refetch();
    } catch {
      toast.error("Não foi possível registrar o pagamento.");
    }
  };

  const seller = sellerQuery.data;
  const canResolveDisputes = userRole === "Owner" || userRole === "Gestor";
  const canRegisterPayment = userRole === "Owner" || userRole === "Financeiro";

  return (
    <DashboardLayout>
      <div className="flex items-center gap-2 pb-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void navigate({ to: "/app/gestao/comissoes" })}
        >
          <Icon icon="mdi:arrow-left" size={14} />
          <span className="ml-1.5">Voltar</span>
        </Button>
        <span className="text-xs text-muted-foreground">
          / {labelForPeriod(filtersCtl.filters.period)}
        </span>
      </div>

      <CommissionsHeader
        period={filtersCtl.filters.period}
        sellerId={sellerId}
        sellers={[]}
        sellerLocked
        activeFilterCount={filtersCtl.activeCount}
        subtitle={seller ? `Comissões de ${seller.fullName}` : "Comissões do vendedor"}
        onPeriodChange={filtersCtl.setPeriod}
        onSellerChange={filtersCtl.setSeller}
        onReset={filtersCtl.reset}
      />

      <section className="mt-6">
        <CommissionsKpiGrid
          totals={totals}
          previousTotal={previousTotal}
          previousDeltaPct={previousDeltaPct}
          previousLabel={labelForPeriod(previousPeriod(filtersCtl.filters.period))}
        />
      </section>

      <section className="mt-6">
        {list.isLoading ? (
          <Card className="p-5">
            <Skeleton className="h-72 w-full" />
          </Card>
        ) : list.data.length === 0 ? (
          <Card className="p-12 text-center">
            <Icon icon="mdi:cash-clock" size={36} className="mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm font-semibold text-foreground">{S.drillEmpty}</p>
          </Card>
        ) : (
          <CommissionsMyOrdersTable
            commissions={list.data}
            canContest={userRole === "Vendedor" && currentUser?.sellerId === sellerId}
            onContestDone={() => list.refetch()}
          />
        )}
      </section>

      {(canResolveDisputes || canRegisterPayment) && list.data.length > 0 && (
        <section className="mt-6 space-y-3">
          {canResolveDisputes &&
            list.data
              .filter((c) => c.status === "disputed")
              .map((c) => (
                <Card key={`dispute-${c.id}`} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-foreground">
                        <Icon
                          icon="mdi:flag"
                          size={14}
                          className="mr-1 inline align-text-bottom text-warning"
                        />
                        Disputa aberta no pedido #{c.orderId.replace(/^order-/, "PD-")}
                      </p>
                      <p className="mt-1 text-xs text-muted-foreground">{c.disputeReason}</p>
                    </div>
                    <Button size="sm" onClick={() => setResolving(c)}>
                      {S.disputeResolveCta}
                    </Button>
                  </div>
                </Card>
              ))}
          {canRegisterPayment &&
            list.data
              .filter((c) => c.status === "approved")
              .map((c) => (
                <Card key={`pay-${c.id}`} className="p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-foreground">
                        Aguardando pagamento — #{c.orderId.replace(/^order-/, "PD-")}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Aprovada em{" "}
                        {c.approvedAt ? new Date(c.approvedAt).toLocaleDateString("pt-BR") : "—"}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void handleRegisterPayment(c)}
                    >
                      <Icon icon="mdi:cash-check" size={14} />
                      <span className="ml-1.5">{S.registerPaymentCta}</span>
                    </Button>
                  </div>
                </Card>
              ))}
        </section>
      )}

      <ResolveDisputeDialog
        open={Boolean(resolving)}
        commission={resolving}
        onClose={() => setResolving(null)}
        onResolve={handleResolve}
      />
    </DashboardLayout>
  );
}
