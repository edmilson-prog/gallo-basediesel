import { useMemo, useState } from "react";
import type { IInsight, ID } from "@/shared/types";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { toast } from "sonner";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { useCurrentStore } from "@/features/multistore";
import { DashboardLayout } from "@/features/shell/layouts";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { auditLog } from "@/features/rbac/utils/auditLog";
import { InsightKpis } from "../components/InsightKpis";
import { InsightFilters } from "../components/InsightFilters";
import { InsightCard } from "../components/InsightCard";
import { DismissInsightModal } from "../components/DismissInsightModal";
import { useInsightsDailyDetection } from "../hooks/useInsightsDailyDetection";
import { useInsightsFilters } from "../hooks/useInsightsFilters";
import { useDismissalsStore } from "../store/dismissalsStore";
import { INSIGHTS_STRINGS as S } from "../i18n/pt-BR";

const ALLOWED_ROLES = new Set(["Owner", "Gestor", "Financeiro"]);

const PERIOD_TO_DAYS: Record<string, number | null> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
  all: null,
};

/**
 * `/app/insights` — IA Analítica / Insights Hub (PRD-053).
 *
 * Surfaces patterns detected by the engine, lets Owner/Gestor/Financeiro
 * dismiss with a reason and drill into the originating analytical PRD.
 */
export function InsightsHubPage() {
  const role = useCurrentRole();
  const { currentUser } = useAuth();
  const { currentStore, accessibleStores } = useCurrentStore();
  const filters = useInsightsFilters();
  const dismiss = useDismissalsStore((s) => s.dismiss);

  const [dismissTarget, setDismissTarget] = useState<IInsight | null>(null);

  const isAllowed = role !== null && ALLOWED_ROLES.has(role);
  const storeId = (currentStore?.id ?? "store-matriz") as ID;
  const accessibleStoreIds = useMemo(() => accessibleStores.map((s) => s.id), [accessibleStores]);

  const result = useInsightsDailyDetection(storeId, accessibleStoreIds);

  const visible = useMemo<IInsight[]>(() => {
    const base = filters.state.status === "ativos" ? result.active : result.dismissed;
    const since =
      PERIOD_TO_DAYS[filters.state.period] === null
        ? null
        : new Date(
            Date.now() - (PERIOD_TO_DAYS[filters.state.period] as number) * 24 * 60 * 60 * 1000,
          ).toISOString();
    return base.filter((ins) => {
      // Financeiro role only sees financial-category insights.
      if (role === "Financeiro" && ins.category !== "financeiro") return false;
      if (filters.state.category !== "all" && ins.category !== filters.state.category) return false;
      if (filters.state.priority !== "all" && ins.priority !== filters.state.priority) return false;
      if (since !== null && ins.detectedAt < since) return false;
      return true;
    });
  }, [result.active, result.dismissed, filters.state, role]);

  const kpis = useMemo(() => {
    const active = result.active.filter((ins) =>
      role === "Financeiro" ? ins.category === "financeiro" : true,
    );
    return {
      total: active.length,
      critical: active.filter((i) => i.priority === "critico").length,
      medium: active.filter((i) => i.priority === "medio").length,
      opportunity: active.filter((i) => i.priority === "oportunidade").length,
    };
  }, [result.active, role]);

  const handleDismiss = (insight: IInsight) => {
    setDismissTarget(insight);
  };

  const confirmDismiss = (reason: string | undefined) => {
    if (!dismissTarget) return;
    const actorId = currentUser?.id ?? "system";
    const dismissedAt = new Date().toISOString();
    dismiss({
      insightId: dismissTarget.id,
      dismissedBy: actorId,
      dismissedAt,
      reason,
      validUntil: dismissTarget.validUntil,
      snapshot: {
        type: dismissTarget.type,
        title: dismissTarget.title,
        description: dismissTarget.description,
        storeId: dismissTarget.storeId,
        detectedAt: dismissTarget.detectedAt,
      },
    });
    auditLog({
      action: "insight_dismiss",
      resource: "insight",
      resourceId: dismissTarget.id,
      after: { reason: reason ?? "", validUntil: dismissTarget.validUntil ?? null },
      storeId: dismissTarget.storeId,
    });
    toast.success("Insight dispensado.");
    setDismissTarget(null);
  };

  if (!isAllowed) {
    return (
      <DashboardLayout>
        <EmptyState
          icon="mdi:shield-lock-outline"
          title={S.blockedTitle}
          description={S.blockedDescription}
          actionLabel="Voltar ao início"
          actionTo="/app/inicio"
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <header className="mb-6 flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
          <Icon icon="mdi:brain" size={26} className="text-primary" />
          {S.pageTitle}
        </h1>
        <p className="text-sm text-muted-foreground">{S.pageSubtitle}</p>
      </header>

      <section className="mb-6">
        <InsightKpis kpis={kpis} />
      </section>

      <section className="mb-6">
        <InsightFilters
          category={filters.state.category}
          onCategoryChange={filters.setCategory}
          priority={filters.state.priority}
          onPriorityChange={filters.setPriority}
          period={filters.state.period}
          onPeriodChange={filters.setPeriod}
          status={filters.state.status}
          onStatusChange={filters.setStatus}
          activeCount={filters.activeCount}
          onClear={filters.reset}
        />
      </section>

      {result.isError ? (
        <Card className="flex flex-col items-center gap-3 border-destructive/40 bg-destructive/10 p-6 text-sm">
          <Icon icon="mdi:alert-circle-outline" size={28} className="text-destructive" />
          <p className="text-destructive">{S.errorTitle}</p>
          <Button variant="outline" size="sm" onClick={result.refetch}>
            {S.errorRetry}
          </Button>
        </Card>
      ) : result.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      ) : visible.length === 0 ? (
        result.all.length === 0 && filters.state.status === "ativos" ? (
          <EmptyStateForInsights kind="disabled-or-empty" />
        ) : filters.state.status === "dispensados" ? (
          <EmptyStateForInsights kind="dismissed" />
        ) : (
          <EmptyStateForInsights kind="active" />
        )
      ) : (
        <ul className="space-y-3" aria-label="Lista de insights">
          {visible.map((insight) => (
            <li key={insight.id}>
              <InsightCard
                insight={insight}
                onDismiss={handleDismiss}
                dismissed={filters.state.status === "dispensados"}
              />
            </li>
          ))}
        </ul>
      )}

      <DismissInsightModal
        open={dismissTarget !== null}
        onOpenChange={(open) => {
          if (!open) setDismissTarget(null);
        }}
        insightTitle={dismissTarget?.title ?? ""}
        onConfirm={confirmDismiss}
      />
    </DashboardLayout>
  );
}

function EmptyStateForInsights({ kind }: { kind: "active" | "dismissed" | "disabled-or-empty" }) {
  if (kind === "dismissed") {
    return (
      <EmptyState
        icon="mdi:archive-outline"
        title={S.emptyDismissedTitle}
        description={S.emptyDismissedDescription}
      />
    );
  }
  if (kind === "disabled-or-empty") {
    return (
      <EmptyState
        icon="mdi:lightbulb-off-outline"
        title={S.emptyDisabledTitle}
        description={S.emptyDisabledDescription}
        actionLabel="Abrir configuração"
        actionTo="/app/configuracoes/insights"
      />
    );
  }
  return (
    <EmptyState
      icon="mdi:lightbulb-on-outline"
      title={S.emptyActiveTitle}
      description={S.emptyActiveDescription}
    />
  );
}
