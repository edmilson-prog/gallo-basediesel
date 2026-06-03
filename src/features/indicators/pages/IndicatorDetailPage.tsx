import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Icon } from "@/components/Icon";
import { DashboardLayout } from "@/features/shell/layouts";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { GoalStatusBadge } from "@/features/goals/components/GoalStatusBadge";
import { useAuth } from "@/features/auth/useAuth";
import {
  recordAuditLogSync,
  useIndicatorsProvider,
  useOrdersProvider,
  usePartsProvider,
  useSellersProvider,
} from "@/providers/data";
import type { ID } from "@/shared/types";
import { formatDateBR } from "@/shared/utils/format";
import { useIndicatorProgress } from "../hooks/useIndicatorProgress";
import { CancelIndicatorDialog } from "../components/CancelIndicatorDialog";
import { ContributionRanking } from "../components/ContributionRanking";
import { EditIndicatorModal } from "../components/EditIndicatorModal";
import { IndicatorEvolutionChart } from "../components/IndicatorEvolutionChart";
import { IndicatorLifecycleBadge } from "../components/IndicatorLifecycleBadge";
import { IndicatorCompositionSection } from "../components/detail/IndicatorCompositionSection";
import { IndicatorProgressSummary } from "../components/detail/IndicatorProgressSummary";
import { indicatorsPtBR as S } from "../i18n/pt-BR";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STALE_MS = 30_000;

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function IndicatorDetailPage() {
  const { id } = useParams({ from: "/app/gestao/indicadores/$id" });
  const navigate = useNavigate();
  const { userRole, currentUser } = useAuth();
  const { indicator, progress, isLoading, hasError, refetch } = useIndicatorProgress(id);
  const indicatorsProvider = useIndicatorsProvider();
  const sellersProvider = useSellersProvider();
  const ordersProvider = useOrdersProvider();
  const partsProvider = usePartsProvider();

  // ── seller name for header (individual scope) ──────────────────────────────
  const [headerSellerName, setHeaderSellerName] = useState<string | undefined>(undefined);

  useEffect(() => {
    if (!indicator || indicator.scopeLevel !== "individual" || !indicator.sellerId) return;
    let cancelled = false;
    void sellersProvider.get(indicator.sellerId).then(
      (seller) => {
        if (!cancelled) setHeaderSellerName(seller.fullName);
      },
      () => {
        if (!cancelled) setHeaderSellerName(undefined);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [indicator, sellersProvider]);

  // ── sellers list for ContributionRanking ───────────────────────────────────
  const sellersQuery = useQuery({
    queryKey: ["sellers", "list", indicator?.storeId],
    queryFn: () => sellersProvider.list({ storeId: indicator?.storeId }),
    staleTime: STALE_MS,
    enabled: Boolean(indicator),
  });

  const sellersMap = useMemo(() => {
    const map = new Map<ID, string>();
    for (const s of sellersQuery.data ?? []) {
      map.set(s.id, s.fullName);
    }
    return map;
  }, [sellersQuery.data]);

  const resolveSellerName = (sellerId: ID): string => sellersMap.get(sellerId) ?? sellerId;

  // ── orders + parts (same query keys as useIndicatorProgress → cache hit) ───
  const ordersQuery = useQuery({
    queryKey: [
      "indicators",
      "progress-orders",
      indicator?.storeId,
      indicator?.sellerId,
      indicator?.scopeLevel,
    ],
    queryFn: () =>
      ordersProvider.list({
        storeId: indicator?.storeId,
        sellerId: indicator?.scopeLevel === "individual" ? indicator.sellerId : undefined,
        paymentStatus: "pago",
        pageSize: 2000,
      }),
    staleTime: STALE_MS,
    enabled: Boolean(indicator),
  });

  const partsQuery = useQuery({
    queryKey: ["indicators", "progress-parts"],
    queryFn: () => partsProvider.list({ pageSize: 5000 }),
    staleTime: STALE_MS,
    enabled: Boolean(indicator),
  });

  const orders = ordersQuery.data?.data ?? [];
  const parts = partsQuery.data?.data ?? [];

  // ── modal state ────────────────────────────────────────────────────────────
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);

  const actorId = currentUser?.sellerId ?? currentUser?.id ?? "system";

  // ── loading / error states ─────────────────────────────────────────────────
  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="flex flex-col gap-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (hasError || !indicator || !progress) {
    return (
      <DashboardLayout>
        <EmptyState
          icon="mdi:alert-circle-outline"
          title="Indicador não encontrado"
          description="O indicador solicitado não existe ou foi removido."
          actionLabel={S.backToList}
          actionTo="/app/gestao/indicadores"
        />
      </DashboardLayout>
    );
  }

  // Vendedor só visualiza os próprios indicadores (individual scope)
  if (
    userRole === "Vendedor" &&
    indicator.scopeLevel === "individual" &&
    indicator.sellerId !== currentUser?.sellerId
  ) {
    return (
      <DashboardLayout>
        <EmptyState
          icon="mdi:shield-lock-outline"
          title={S.accessDeniedTitle}
          description={S.accessDeniedDescription}
          actionLabel={S.accessDeniedAction}
          actionTo="/app/gestao/indicadores"
        />
      </DashboardLayout>
    );
  }

  const canEdit = userRole === "Owner" || userRole === "Gestor";
  const isEditable = indicator.status === "ativo";

  // Scope label for header
  const scopeLabel =
    indicator.scopeLevel === "individual"
      ? (headerSellerName ?? S.scope.individual)
      : S.scope[indicator.scopeLevel];

  // Selector kind label
  const selectorLabel = S.selectorKind[indicator.selector.kind];
  // Metric label
  const metricLabel = S.metric[indicator.metric];

  // ── archive handler ────────────────────────────────────────────────────────
  const handleArchive = async () => {
    if (isArchiving) return;
    setIsArchiving(true);
    try {
      await indicatorsProvider.update(id, { status: "arquivado" });
      recordAuditLogSync({
        actorId,
        action: "indicator_archive",
        resource: "indicator",
        resourceId: id,
        storeId: indicator.storeId,
      });
      toast.success(S.archiveSuccess);
      refetch();
    } catch {
      toast.error(S.saveError);
    } finally {
      setIsArchiving(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4">
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <Card className="flex flex-col gap-4 p-5">
          <div className="flex flex-col gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="self-start gap-1 px-2 text-xs"
              onClick={() => void navigate({ to: "/app/gestao/indicadores" })}
            >
              <Icon icon="mdi:arrow-left" size={14} />
              {S.backToList}
            </Button>

            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {indicator.name}
            </h1>

            <div className="flex flex-wrap items-center gap-2">
              {/* Selector kind badge */}
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                <Icon icon="mdi:tag-outline" size={12} />
                {selectorLabel}
              </span>

              {/* Metric badge */}
              <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-xs font-medium text-muted-foreground">
                <Icon icon="mdi:chart-bar" size={12} />
                {metricLabel}
              </span>

              {/* Progress status badge */}
              <GoalStatusBadge mode="progress" value={progress.status} />

              {/* Lifecycle status badge (when not ativo) */}
              {indicator.status !== "ativo" && (
                <IndicatorLifecycleBadge status={indicator.status} />
              )}

              {/* Scope */}
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Icon icon="mdi:account-tie-outline" size={13} />
                {scopeLabel}
              </span>

              {/* Period */}
              <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                <Icon icon="mdi:calendar-range" size={13} />
                {formatDateBR(indicator.period.start)} → {formatDateBR(indicator.period.end)}
              </span>
            </div>

            {/* Reward description (if set) */}
            {indicator.rewardDescription && (
              <p className="mt-1 flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-xs text-amber-800 dark:text-amber-200">
                <Icon icon="mdi:gift-outline" size={14} className="shrink-0" />
                {indicator.rewardDescription}
              </p>
            )}
          </div>

          {/* Actions — Owner/Gestor + only when ativo */}
          {canEdit && isEditable && (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditOpen(true)}
                className="gap-1"
              >
                <Icon icon="mdi:pencil-outline" size={14} />
                {S.editCta}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isArchiving}
                onClick={() => void handleArchive()}
                className="gap-1"
              >
                <Icon icon="mdi:archive-outline" size={14} />
                {S.archiveCta}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCancelOpen(true)}
                className="gap-1 text-red-600 hover:text-red-700 dark:text-red-400"
              >
                <Icon icon="mdi:close-circle-outline" size={14} />
                {S.cancelCta}
              </Button>
            </div>
          )}
        </Card>

        {/* ── Progress summary ───────────────────────────────────────────── */}
        <IndicatorProgressSummary
          indicator={indicator}
          currentValue={progress.currentValue}
          percentage={progress.percentage}
          projection={progress.projection}
          daysRemaining={progress.daysRemaining}
          status={progress.status}
        />

        {/* ── Evolution chart ────────────────────────────────────────────── */}
        <IndicatorEvolutionChart
          indicator={indicator}
          orders={orders}
          parts={parts}
          targetValue={indicator.targetValue}
        />

        {/* ── Contribution ranking (hidden for individual scope) ─────────── */}
        {indicator.scopeLevel !== "individual" && (
          <ContributionRanking
            contributors={progress.contributors}
            metric={indicator.metric}
            sellerName={resolveSellerName}
          />
        )}

        {/* ── Composition table ──────────────────────────────────────────── */}
        <IndicatorCompositionSection
          indicator={indicator}
          orders={orders}
          parts={parts}
          sellerName={resolveSellerName}
        />
      </div>

      {/* ── Modals (Owner/Gestor only) ─────────────────────────────────── */}
      {canEdit && (
        <>
          <EditIndicatorModal
            indicator={indicator}
            open={editOpen}
            onOpenChange={setEditOpen}
            actorId={actorId}
            onSaved={() => refetch()}
          />
          <CancelIndicatorDialog
            indicator={indicator}
            open={cancelOpen}
            onOpenChange={setCancelOpen}
            actorId={actorId}
            onCanceled={() => refetch()}
          />
        </>
      )}
    </DashboardLayout>
  );
}
