import { useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { ID, IBadgeDefinition, ISeller, IStore } from "@/shared/types";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { DashboardLayout } from "@/features/shell/layouts";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { Button } from "@/components/ui/button";
import { useRanking } from "../hooks/useRanking";
import { useRankingFilters } from "../hooks/useRankingFilters";
import { RankingHeader } from "../components/RankingHeader";
import { RankingPodium } from "../components/RankingPodium";
import { RankingTable } from "../components/RankingTable";
import { RecentBadgesCard } from "../components/RecentBadgesCard";
import { useBadges } from "../hooks/useBadges";
import { GAMIFICATION_STRINGS as S } from "../i18n/pt-BR";

const ALLOWED_ROLES = new Set(["Owner", "Gestor", "Vendedor", "Financeiro"]);

/**
 * Main ranking page (`/app/gestao/ranking`) — PRD-043.
 *
 * Header (period/store URL-synced filters) + podium top-3 + remaining table
 * with sticky highlight for the signed-in seller + sidecar with the rarest
 * badges of the period.
 *
 * Permissions:
 *  - Vendedor: scope locked to their own store; their row highlighted.
 *  - Gestor: scope locked to their store.
 *  - Owner / Financeiro: cross-store and store selector.
 */
export function RankingPage() {
  const navigate = useNavigate();
  const { userRole, currentUser } = useAuth();
  const { currentStore, accessibleStores } = useCurrentStore();

  const storeLocked = userRole === "Gestor" || userRole === "Vendedor";
  const filtersCtx = useMemo(
    () => ({
      gestorLockedStoreId: storeLocked ? (currentStore?.id ?? undefined) : undefined,
    }),
    [storeLocked, currentStore?.id],
  );

  const filtersCtl = useRankingFilters(filtersCtx);

  const scopeStoreId = useMemo<ID | undefined>(() => {
    if (storeLocked) return currentStore?.id ?? undefined;
    if (filtersCtl.filters.store !== "all") return filtersCtl.filters.store;
    return undefined; // all stores — but mock only has one
  }, [storeLocked, currentStore?.id, filtersCtl.filters.store]);

  const ranking = useRanking({
    period: filtersCtl.period,
    scope: { storeId: scopeStoreId },
    enabled: userRole !== null && ALLOWED_ROLES.has(userRole),
  });

  const badgesPeriodQuery = useBadges({
    periodRef: filtersCtl.period.ref,
    enabled: userRole !== null && ALLOWED_ROLES.has(userRole),
  });

  const sellersById = useMemo<Map<ID, ISeller>>(() => {
    const map = new Map<ID, ISeller>();
    for (const s of ranking.sellers) map.set(s.id, s);
    return map;
  }, [ranking.sellers]);

  const storesById = useMemo<Map<ID, IStore>>(() => {
    const map = new Map<ID, IStore>();
    for (const s of accessibleStores) map.set(s.id, s);
    if (currentStore) map.set(currentStore.id, currentStore);
    return map;
  }, [accessibleStores, currentStore]);

  const catalogBySlug = useMemo<Map<string, IBadgeDefinition>>(() => {
    const map = new Map<string, IBadgeDefinition>();
    for (const b of ranking.rules?.badges ?? []) map.set(b.slug, b);
    return map;
  }, [ranking.rules]);

  if (!userRole || !ALLOWED_ROLES.has(userRole)) {
    return (
      <DashboardLayout>
        <EmptyState
          icon="mdi:shield-lock-outline"
          title={S.accessDeniedTitle}
          description={S.accessDeniedDescription}
          actionLabel={S.accessDeniedAction}
          actionTo="/app/inicio"
        />
      </DashboardLayout>
    );
  }

  if (ranking.rules && !ranking.rules.active) {
    return (
      <DashboardLayout>
        <EmptyState
          icon="mdi:trophy-broken"
          title={S.disabledTitle}
          description={S.disabledDescription}
          actionLabel="Abrir configurações"
          actionTo="/app/configuracoes/gamificacao"
        />
      </DashboardLayout>
    );
  }

  if (ranking.hasError) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
          <h2 className="text-2xl font-semibold text-foreground">{S.errorTitle}</h2>
          <p className="mt-2 max-w-md text-sm text-muted-foreground">{S.errorDescription}</p>
          <Button type="button" onClick={ranking.refetch} className="mt-6">
            {S.retry}
          </Button>
        </div>
      </DashboardLayout>
    );
  }

  const topEntries = ranking.ranking.slice(0, 3);
  const restEntries = ranking.ranking.slice(3);
  const showStoreCol = accessibleStores.length > 1 && !storeLocked;

  const handleSellerClick = (sellerId: ID) => {
    if (userRole === "Vendedor" && sellerId !== currentUser?.sellerId) return;
    void navigate({ to: "/app/gestao/ranking/$sellerId", params: { sellerId } });
  };

  return (
    <DashboardLayout>
      <RankingHeader
        period={filtersCtl.filters.period}
        store={filtersCtl.filters.store}
        stores={accessibleStores}
        storeLocked={storeLocked}
        activeFilterCount={filtersCtl.activeCount}
        onPeriodChange={filtersCtl.setPeriod}
        onStoreChange={filtersCtl.setStore}
        onReset={filtersCtl.reset}
      />

      <section className="mt-6">
        <RankingPodium
          topEntries={topEntries}
          sellersById={sellersById}
          catalogBySlug={catalogBySlug}
          onSellerClick={handleSellerClick}
        />
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-[1fr_320px]">
        <RankingTable
          entries={restEntries.length > 0 ? restEntries : ranking.ranking}
          sellersById={sellersById}
          storesById={storesById}
          catalogBySlug={catalogBySlug}
          highlightSellerId={currentUser?.sellerId}
          showStoreColumn={showStoreCol}
          onSellerClick={handleSellerClick}
        />
        <RecentBadgesCard
          badges={badgesPeriodQuery.badges}
          sellersById={sellersById}
          catalogBySlug={catalogBySlug}
        />
      </section>
    </DashboardLayout>
  );
}
