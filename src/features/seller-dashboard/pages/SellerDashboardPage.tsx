import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { usePermission } from "@/features/rbac/hooks/usePermission";
import { DashboardLayout } from "@/features/shell/layouts";
import { Skeleton } from "@/components/ui/skeleton";
import { useSellerPeriod } from "../hooks/useSellerPeriod";
import { useSellerServiceMetrics } from "../hooks/useSellerServiceMetrics";
import { useSellerGoalProgress } from "../hooks/useSellerGoalProgress";
import { useSellerQueue } from "../hooks/useSellerQueue";
import { SellerGreeting } from "../components/SellerGreeting";
import { SellerKpiRow } from "../components/SellerKpiRow";
import { SellerGoalCard } from "../components/SellerGoalCard";
import { SellerActivityChart } from "../components/SellerActivityChart";
import { SellerQueueCard } from "../components/SellerQueueCard";
import { SellerRecordsCard } from "../components/SellerRecordsCard";
import { SELLER_DASHBOARD_STRINGS } from "../i18n/pt-BR";

/**
 * Personal home for the Vendedor role at `/app/inicio` — replaces the
 * blocked `EmptyState` that `ManagerDashboardPage` used to render for this
 * role. Design imported from Claude Design (`ui_kits/dashboard`).
 *
 * The design's "Ranking da loja" card is deliberately absent: computing a
 * store ranking client-side requires reading every seller's orders and
 * customers, which per-seller RLS (`orders_select`/`customers_select`:
 * `is_staff() OR seller_id = current_seller_id()`) returns empty for a
 * Vendedor — scoring every colleague 0 and showing the viewer "#1". Restoring
 * it needs a SECURITY DEFINER RPC that aggregates ranking server-side; see
 * docs/superpowers/specs/2026-07-23-painel-vendedor-inicio-design.md.
 */
export function SellerDashboardPage() {
  const { currentUser } = useAuth();
  const { currentStoreId, isHydrating: isStoreHydrating } = useCurrentStore();
  const { period, window, setPeriod, now } = useSellerPeriod();

  const sellerId = currentUser?.sellerId;
  const storeId = currentStoreId;

  // Permissions live in the editable matrix (Configurações → Papéis), not in
  // the role name: an Owner can revoke `goal:view` from Vendedor and the Metas
  // menu disappears. Each card mirrors the resource that governs its full
  // screen, so the home screen never shows what the matrix has taken away.
  const canViewGoals = usePermission("goal", "view");
  const canViewConversations = usePermission("conversation", "view");
  const canViewOrders = usePermission("order", "view");

  const service = useSellerServiceMetrics({
    storeId: storeId ?? "",
    sellerId: sellerId ?? "",
    window,
  });
  const goalProgress = useSellerGoalProgress(storeId ?? "", sellerId ?? "");
  const queue = useSellerQueue(storeId ?? "", sellerId ?? "");

  if (isStoreHydrating) {
    return (
      <DashboardLayout>
        <div className="space-y-4">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      </DashboardLayout>
    );
  }

  if (!sellerId || !storeId) {
    return (
      <DashboardLayout>
        <p className="text-sm text-muted-foreground">{SELLER_DASHBOARD_STRINGS.noSellerProfile}</p>
      </DashboardLayout>
    );
  }

  const firstName = currentUser?.displayName?.split(" ")[0] ?? currentUser?.displayName ?? "";

  return (
    <DashboardLayout>
      <SellerGreeting firstName={firstName} period={period} onPeriodChange={setPeriod} now={now} />
      {(canViewConversations || canViewOrders) && (
        <SellerKpiRow
          metrics={service.metrics}
          salesCurrent={service.salesCurrent}
          salesPrevious={service.salesPrevious}
          isLoading={service.isLoading}
          hasError={service.isError}
          onRetry={service.refetch}
          showSales={canViewOrders}
          showService={canViewConversations}
        />
      )}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-4">
          {canViewGoals && (
            <SellerGoalCard
              goal={goalProgress.goal}
              progress={goalProgress.progress}
              pace={goalProgress.pace}
              isLoading={goalProgress.isLoading}
              hasError={goalProgress.hasError}
            />
          )}
          {canViewConversations && (
            <SellerActivityChart
              period={period}
              metrics={service.metrics}
              conversationsCurrent={service.conversationsCurrent}
              now={now}
            />
          )}
        </div>
        <div className="flex flex-col gap-4">
          {canViewConversations && (
            <SellerQueueCard
              entries={queue.entries}
              total={queue.total}
              isLoading={queue.isLoading}
              hasError={queue.hasError}
              now={now}
            />
          )}
          <SellerRecordsCard />
        </div>
      </div>
    </DashboardLayout>
  );
}
