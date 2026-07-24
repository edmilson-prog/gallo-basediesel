// src/features/seller-dashboard/pages/SellerDashboardPage.tsx
import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { DashboardLayout } from "@/features/shell/layouts";
import { Skeleton } from "@/components/ui/skeleton";
import { useSellerPeriod } from "../hooks/useSellerPeriod";
import { useSellerServiceMetrics } from "../hooks/useSellerServiceMetrics";
import { useSellerGoalProgress } from "../hooks/useSellerGoalProgress";
import { useSellerQueue } from "../hooks/useSellerQueue";
import { useSellerRanking } from "../hooks/useSellerRanking";
import { SellerGreeting } from "../components/SellerGreeting";
import { SellerKpiRow } from "../components/SellerKpiRow";
import { SellerGoalCard } from "../components/SellerGoalCard";
import { SellerActivityChart } from "../components/SellerActivityChart";
import { SellerQueueCard } from "../components/SellerQueueCard";
import { SellerRankingCard } from "../components/SellerRankingCard";
import { SellerRecordsCard } from "../components/SellerRecordsCard";
import { SELLER_DASHBOARD_STRINGS } from "../i18n/pt-BR";

/**
 * Personal home for the Vendedor role at `/app/inicio` — replaces the
 * blocked `EmptyState` that `ManagerDashboardPage` used to render for this
 * role. Design imported from Claude Design (`ui_kits/dashboard`).
 */
export function SellerDashboardPage() {
  const { currentUser } = useAuth();
  const { currentStoreId, isHydrating: isStoreHydrating } = useCurrentStore();
  const { period, window, setPeriod } = useSellerPeriod();

  const sellerId = currentUser?.sellerId;
  const storeId = currentStoreId;

  const service = useSellerServiceMetrics({
    storeId: storeId ?? "",
    sellerId: sellerId ?? "",
    window,
  });
  const goalProgress = useSellerGoalProgress(storeId ?? "", sellerId ?? "");
  const queue = useSellerQueue();
  const ranking = useSellerRanking(storeId ?? "", sellerId ?? "");

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
      <SellerGreeting firstName={firstName} period={period} onPeriodChange={setPeriod} />
      <SellerKpiRow
        metrics={service.metrics}
        salesCurrent={service.salesCurrent}
        salesPrevious={service.salesPrevious}
        isLoading={service.isLoading}
      />
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[1.5fr_1fr]">
        <div className="flex flex-col gap-4">
          <SellerGoalCard goal={goalProgress.goal} pace={goalProgress.pace} isLoading={goalProgress.isLoading} />
          <SellerActivityChart
            period={period}
            metrics={service.metrics}
            conversationsCurrent={service.conversationsCurrent}
          />
        </div>
        <div className="flex flex-col gap-4">
          <SellerQueueCard entries={queue.entries} total={queue.total} isLoading={queue.isLoading} />
          <SellerRankingCard
            entry={ranking.entry}
            totalSellers={ranking.totalSellers}
            isLoading={ranking.isLoading}
          />
        </div>
      </div>
      <div className="mt-4">
        <SellerRecordsCard />
      </div>
    </DashboardLayout>
  );
}
