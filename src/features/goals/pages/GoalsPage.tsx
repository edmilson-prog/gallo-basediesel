import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { DashboardLayout } from "@/features/shell/layouts";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { IndividualGoalsDashboard } from "../components/IndividualGoalsDashboard";
import { AggregatedGoalsDashboard } from "../components/AggregatedGoalsDashboard";
import { GOALS_STRINGS as S } from "../i18n/pt-BR";

const ALLOWED_ROLES = new Set(["Owner", "Gestor", "Vendedor", "Financeiro"]);

export function GoalsPage() {
  const { userRole, currentUser } = useAuth();
  const { currentStore } = useCurrentStore();
  const storeId = currentStore?.id ?? "store-matriz";

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

  if (userRole === "Vendedor") {
    return (
      <DashboardLayout>
        <IndividualGoalsDashboard
          sellerId={currentUser?.sellerId}
          displayName={currentUser?.displayName}
        />
      </DashboardLayout>
    );
  }

  const storeLocked = userRole === "Gestor";
  const canCreate = userRole === "Owner" || userRole === "Gestor";

  return (
    <DashboardLayout>
      <AggregatedGoalsDashboard storeId={storeId} storeLocked={storeLocked} canCreate={canCreate} />
    </DashboardLayout>
  );
}
