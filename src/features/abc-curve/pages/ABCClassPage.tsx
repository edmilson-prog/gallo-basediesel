import { useMemo } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import type { ABCClass, ID, ISeller } from "@/shared/types";
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { DashboardLayout } from "@/features/shell/layouts";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { formatBRLCompact, formatPercent } from "@/shared/utils/format";
import { useSellersProvider } from "@/providers/data";
import { ABCCustomersTable } from "../components/ABCCustomersTable";
import { useABCFilters } from "../hooks/useABCFilters";
import { useABCClassification } from "../hooks/useABCClassification";
import { ABC_STRINGS as S } from "../i18n/pt-BR";

const ALLOWED_ROLES = new Set(["Owner", "Gestor", "Vendedor", "Financeiro"]);
const VALID_CLASSES = new Set<string>(["A", "B", "C"]);

/**
 * Per-class drill-down page (`/app/gestao/abc/$class`). PRD-045.
 *
 * Shows the full ranked list of customers in the requested class with all
 * the same filters as the main page (URL-synced) and migration metadata.
 */
export function ABCClassPage() {
  const navigate = useNavigate();
  const params = useParams({ from: "/app/gestao/abc/$class" });
  const klass = (params.class ?? "").toUpperCase();
  const { userRole, currentUser } = useAuth();
  const { currentStore } = useCurrentStore();
  const sellersProvider = useSellersProvider();

  const storeLocked = userRole === "Gestor";
  const sellerLocked = userRole === "Vendedor";
  const sellerLockedId = sellerLocked ? currentUser?.sellerId : undefined;

  const filtersCtx = useMemo(
    () => ({
      gestorLockedStoreId: storeLocked ? (currentStore?.id ?? undefined) : undefined,
      sellerLockedId,
    }),
    [storeLocked, currentStore?.id, sellerLockedId],
  );
  const filtersCtl = useABCFilters(filtersCtx);

  const scope = useMemo(() => {
    const scopeStoreId =
      storeLocked || filtersCtl.filters.store !== "all"
        ? filtersCtl.filters.store === "all"
          ? (currentStore?.id ?? undefined)
          : filtersCtl.filters.store
        : undefined;
    const scopeSellerId = sellerLocked
      ? sellerLockedId
      : filtersCtl.filters.seller !== "all"
        ? filtersCtl.filters.seller
        : undefined;
    return { storeId: scopeStoreId, sellerId: scopeSellerId };
  }, [
    storeLocked,
    sellerLocked,
    sellerLockedId,
    currentStore?.id,
    filtersCtl.filters.store,
    filtersCtl.filters.seller,
  ]);

  const { metrics, isLoading } = useABCClassification({
    window: filtersCtl.window,
    previousWindow: filtersCtl.previousWindow,
    scope,
    enabled: userRole !== null && ALLOWED_ROLES.has(userRole) && VALID_CLASSES.has(klass),
  });

  const sellersQuery = useQuery({
    queryKey: ["abc-class-page", "sellers", scope.storeId],
    queryFn: () => sellersProvider.list({ storeId: scope.storeId }),
    staleTime: 60_000,
  });
  const sellersById = useMemo<Map<ID, ISeller>>(() => {
    const map = new Map<ID, ISeller>();
    for (const s of sellersQuery.data ?? []) map.set(s.id, s);
    return map;
  }, [sellersQuery.data]);

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
  if (!VALID_CLASSES.has(klass)) {
    return (
      <DashboardLayout>
        <EmptyState
          icon="mdi:alert-outline"
          title={S.invalidClassTitle}
          description={S.invalidClassDescription}
          actionLabel={S.drillBack}
          actionTo="/app/gestao/abc"
        />
      </DashboardLayout>
    );
  }

  const classBucket = metrics?.byClass[klass as ABCClass];
  const records = (metrics?.recordsWithMigration ?? []).filter(
    (r) => r.class === (klass as ABCClass),
  );

  return (
    <DashboardLayout>
      <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => void navigate({ to: "/app/gestao/abc" })}
          className="gap-1"
        >
          <Icon icon="mdi:chevron-left" size={16} />
          {S.drillBack}
        </Button>
      </div>

      <header className="mb-6 flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight text-foreground">
          <Icon icon="mdi:chart-arc" size={26} className="text-primary" />
          {S.drillTitle(klass)}
        </h1>
      </header>

      <section
        className="grid grid-cols-1 gap-4 sm:grid-cols-3"
        aria-label={`KPIs Classe ${klass}`}
      >
        <KpiTile label={S.drillKpiCount} value={classBucket?.count ?? 0} isLoading={isLoading} />
        <KpiTile
          label={S.drillKpiRevenue}
          value={formatBRLCompact(classBucket?.revenue ?? 0)}
          isLoading={isLoading}
          isString
        />
        <KpiTile
          label={S.drillKpiShare}
          value={formatPercent(classBucket?.revenuePct ?? 0)}
          isLoading={isLoading}
          isString
        />
      </section>

      <section className="mt-6">
        <ABCCustomersTable
          records={records}
          sellersById={sellersById}
          isLoading={isLoading}
          onOpenProfile={(id) => void navigate({ to: "/app/clientes/$id", params: { id } })}
        />
      </section>
    </DashboardLayout>
  );
}

function KpiTile({
  label,
  value,
  isLoading,
  isString,
}: {
  label: string;
  value: number | string;
  isLoading?: boolean;
  isString?: boolean;
}) {
  return (
    <Card className="flex flex-col gap-1 p-4">
      <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      {isLoading ? (
        <Skeleton className="h-7 w-20" />
      ) : (
        <span className="text-2xl font-semibold tracking-tight text-foreground">
          {isString ? (value as string) : (value as number).toLocaleString("pt-BR")}
        </span>
      )}
    </Card>
  );
}
