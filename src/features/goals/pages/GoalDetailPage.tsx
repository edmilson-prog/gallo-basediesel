import { useEffect, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { DashboardLayout } from "@/features/shell/layouts";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/features/auth/useAuth";
import { useSellersProvider } from "@/providers/data";
import { useGoalProgress } from "../hooks/useGoalProgress";
import { GoalDetailHeader } from "../components/detail/GoalDetailHeader";
import { GoalProgressSummary } from "../components/detail/GoalProgressSummary";
import { GoalEvolutionChart } from "../components/detail/GoalEvolutionChart";
import { GoalCompositionSection } from "../components/detail/GoalCompositionSection";
import { GoalHistorySection } from "../components/detail/GoalHistorySection";
import { EditGoalModal } from "../components/EditGoalModal";
import { CancelGoalDialog } from "../components/CancelGoalDialog";
import { GOALS_STRINGS as S } from "../i18n/pt-BR";

export function GoalDetailPage() {
  const { id } = useParams({ from: "/app/gestao/metas/$id" });
  const navigate = useNavigate();
  const { userRole, currentUser } = useAuth();
  const { goal, progress, isLoading, hasError } = useGoalProgress(id);
  const sellersProvider = useSellersProvider();
  const [sellerName, setSellerName] = useState<string | undefined>(undefined);
  const [editOpen, setEditOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  useEffect(() => {
    if (!goal || goal.level !== "individual") return;
    let cancelled = false;
    void sellersProvider.get(goal.targetId).then(
      (seller) => {
        if (!cancelled) setSellerName(seller.fullName);
      },
      () => {
        if (!cancelled) setSellerName(undefined);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [goal, sellersProvider]);

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

  if (hasError || !goal || !progress) {
    return (
      <DashboardLayout>
        <EmptyState
          icon="mdi:alert-circle-outline"
          title="Meta não encontrada"
          description="A meta solicitada não existe ou foi removida."
          actionLabel={S.backToList}
          actionTo="/app/gestao/metas"
        />
      </DashboardLayout>
    );
  }

  // Vendedor pode ver apenas as próprias metas.
  if (
    userRole === "Vendedor" &&
    goal.level === "individual" &&
    goal.targetId !== currentUser?.sellerId
  ) {
    return (
      <DashboardLayout>
        <EmptyState
          icon="mdi:shield-lock-outline"
          title={S.accessDeniedTitle}
          description={S.accessDeniedDescription}
          actionLabel={S.accessDeniedAction}
          actionTo="/app/gestao/metas"
        />
      </DashboardLayout>
    );
  }

  const canEdit = userRole === "Owner" || userRole === "Gestor";
  const actorId = currentUser?.sellerId ?? currentUser?.id ?? "system";

  return (
    <DashboardLayout>
      <div className="flex flex-col gap-4">
        <GoalDetailHeader
          goal={goal}
          progress={progress}
          canEdit={canEdit}
          sellerName={sellerName}
          onEdit={() => setEditOpen(true)}
          onCancel={() => setCancelOpen(true)}
          onBack={() => void navigate({ to: "/app/gestao/metas" })}
        />
        <GoalProgressSummary goal={goal} progress={progress} />
        <GoalEvolutionChart goal={goal} />
        <GoalCompositionSection goal={goal} />
        <GoalHistorySection goalId={goal.id} />
      </div>

      {canEdit && (
        <>
          <EditGoalModal goal={goal} open={editOpen} onOpenChange={setEditOpen} actorId={actorId} />
          <CancelGoalDialog
            goal={goal}
            open={cancelOpen}
            onOpenChange={setCancelOpen}
            actorId={actorId}
            onCanceled={() => void navigate({ to: "/app/gestao/metas" })}
          />
        </>
      )}
    </DashboardLayout>
  );
}
