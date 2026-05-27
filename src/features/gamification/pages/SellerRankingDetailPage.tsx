import { useMemo } from "react";
import { Link, useParams } from "@tanstack/react-router";
import type { ID, IBadgeDefinition, IRankingEntry, ISeller } from "@/shared/types";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { DashboardLayout } from "@/features/shell/layouts";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/Icon";
import { useRanking } from "../hooks/useRanking";
import { useBadges } from "../hooks/useBadges";
import { useSellerHistory } from "../hooks/useSellerHistory";
import { useRankingFilters } from "../hooks/useRankingFilters";
import { SellerAvatar } from "../components/SellerAvatar";
import { BreakdownDonut } from "../components/BreakdownDonut";
import { ScoreHistoryChart } from "../components/ScoreHistoryChart";
import { SellerBadgesGrid } from "../components/SellerBadgesGrid";
import { GAMIFICATION_STRINGS as S } from "../i18n/pt-BR";

const ALLOWED_ROLES = new Set(["Owner", "Gestor", "Vendedor", "Financeiro"]);

function qualitative(position: number, total: number): string {
  if (total === 0) return S.detailQualitativeOther;
  const pct = position / total;
  if (pct <= 0.1) return S.detailQualitativeTop10;
  if (pct <= 0.25) return S.detailQualitativeTop25;
  if (pct <= 0.5) return S.detailQualitativeTop50;
  return S.detailQualitativeOther;
}

/**
 * Per-seller drill-down (`/app/gestao/ranking/$sellerId`) — PRD-043.
 *
 * Header with the seller summary + breakdown donut + history chart + badges
 * grid. A Vendedor accessing another seller's ID is bounced back to the main
 * ranking via the EmptyState.
 */
export function SellerRankingDetailPage() {
  const { sellerId } = useParams({ from: "/app/gestao/ranking/$sellerId" });
  const { userRole, currentUser } = useAuth();
  const { currentStore } = useCurrentStore();

  const isVendedor = userRole === "Vendedor";
  const ownDrill = currentUser?.sellerId === sellerId;

  const filtersCtl = useRankingFilters({
    gestorLockedStoreId: currentStore?.id ?? undefined,
  });

  const ranking = useRanking({
    period: filtersCtl.period,
    scope: { storeId: currentStore?.id ?? undefined },
    enabled: userRole !== null && ALLOWED_ROLES.has(userRole) && (!isVendedor || ownDrill),
  });

  const sellerBadgesQuery = useBadges({
    sellerId,
    enabled: userRole !== null && ALLOWED_ROLES.has(userRole),
  });

  const history = useSellerHistory({
    sellerId,
    storeId: currentStore?.id ?? undefined,
    months: 6,
    enabled: userRole !== null && ALLOWED_ROLES.has(userRole) && (!isVendedor || ownDrill),
  });

  const seller: ISeller | undefined = ranking.sellers.find((s) => s.id === sellerId);
  const entry: IRankingEntry | undefined = ranking.ranking.find((e) => e.sellerId === sellerId);

  const catalogBySlug = useMemo<Map<string, IBadgeDefinition>>(() => {
    const map = new Map<string, IBadgeDefinition>();
    for (const b of ranking.rules?.badges ?? []) map.set(b.slug, b);
    return map;
  }, [ranking.rules]);

  if (!userRole || !ALLOWED_ROLES.has(userRole) || (isVendedor && !ownDrill)) {
    return (
      <DashboardLayout>
        <EmptyState
          icon="mdi:shield-lock-outline"
          title={S.accessDeniedTitle}
          description={S.accessDeniedDescription}
          actionLabel={S.backToRanking}
          actionTo="/app/gestao/ranking"
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
          actionLabel={S.backToRanking}
          actionTo="/app/gestao/ranking"
        />
      </DashboardLayout>
    );
  }

  if (ranking.isLoading || history.isLoading) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
          Carregando…
        </div>
      </DashboardLayout>
    );
  }

  if (ranking.hasError || !seller || !entry) {
    return (
      <DashboardLayout>
        <EmptyState
          icon="mdi:trophy-broken"
          title={S.errorTitle}
          description={S.errorDescription}
          actionLabel={S.backToRanking}
          actionTo="/app/gestao/ranking"
        />
      </DashboardLayout>
    );
  }

  const totalSellers = ranking.ranking.length;
  const qual = qualitative(entry.position, totalSellers);
  const breakdown = entry.breakdown ?? {
    fromGoals: 0,
    fromCustomers: 0,
    fromOrders: 0,
    fromBadges: 0,
  };
  const badgesInPeriod = sellerBadgesQuery.badges.filter(
    (b) => b.periodRef === filtersCtl.period.ref,
  );

  return (
    <DashboardLayout>
      <header className="flex flex-col gap-4 border-b border-border pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          <SellerAvatar fullName={seller.fullName} size="lg" />
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
              {seller.fullName}
            </h1>
            <p className="text-sm text-muted-foreground">
              Posição #{entry.position} de {totalSellers} · {qual}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/app/gestao/ranking">
              <Icon icon="mdi:arrow-left" size={16} />
              <span className="ml-1.5">{S.backToRanking}</span>
            </Link>
          </Button>
        </div>
      </header>

      <section className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">{S.detailScore}</p>
          <p className="mt-1 text-3xl font-bold text-foreground">
            {entry.score.toLocaleString("pt-BR")}{" "}
            <span className="text-base font-medium text-muted-foreground">pts</span>
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {S.detailPosition}
          </p>
          <p className="mt-1 text-3xl font-bold text-foreground">#{entry.position}</p>
          {entry.positionDelta !== undefined && entry.positionDelta !== 0 && (
            <p
              className={`mt-1 text-xs font-medium ${entry.positionDelta > 0 ? "text-success" : "text-destructive"}`}
            >
              {entry.positionDelta > 0 ? "↑" : "↓"} {Math.abs(entry.positionDelta)} vs. anterior
            </p>
          )}
        </Card>
        <Card className="p-4">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {S.detailBadgesCount}
          </p>
          <p className="mt-1 text-3xl font-bold text-foreground">{badgesInPeriod.length}</p>
        </Card>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <BreakdownDonut
          fromGoals={breakdown.fromGoals}
          fromCustomers={breakdown.fromCustomers}
          fromOrders={breakdown.fromOrders}
          fromBadges={breakdown.fromBadges}
        />
        <ScoreHistoryChart data={history.history.map((h) => ({ label: h.label, score: h.score }))} />
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-base font-semibold text-foreground">{S.detailBadgesTitle}</h2>
        <SellerBadgesGrid badges={sellerBadgesQuery.badges} catalogBySlug={catalogBySlug} />
      </section>
    </DashboardLayout>
  );
}
