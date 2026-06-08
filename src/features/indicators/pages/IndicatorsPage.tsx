import { useAuth } from "@/features/auth/useAuth";
import { useCurrentStore } from "@/features/multistore";
import { DashboardLayout } from "@/features/shell/layouts";
import { EmptyState } from "@/features/shell/components/EmptyState";
import { AggregatedIndicatorsDashboard } from "../components/AggregatedIndicatorsDashboard";
import { VendedorIndicatorsDashboard } from "../components/VendedorIndicatorsDashboard";

const ALLOWED_ROLES = new Set(["Owner", "Gestor", "Vendedor", "VendedorExterno", "Financeiro"]);

export function IndicatorsPage() {
  const { userRole, currentUser } = useAuth();
  const { currentStore } = useCurrentStore();
  const storeId = currentStore?.id ?? "00000000-0000-0000-0000-000000000001";

  if (!userRole || !ALLOWED_ROLES.has(userRole)) {
    return (
      <DashboardLayout>
        <EmptyState
          icon="mdi:shield-lock-outline"
          title="Acesso restrito"
          description="Você não tem permissão para acessar esta área."
          actionLabel="Voltar ao início"
          actionTo="/app/inicio"
        />
      </DashboardLayout>
    );
  }

  if (userRole === "Vendedor" || userRole === "VendedorExterno") {
    return (
      <DashboardLayout>
        <VendedorIndicatorsDashboard sellerId={currentUser?.sellerId} storeId={storeId} />
      </DashboardLayout>
    );
  }

  const canCreate = userRole === "Owner" || userRole === "Gestor";

  return (
    <DashboardLayout>
      <AggregatedIndicatorsDashboard storeId={storeId} canCreate={canCreate} />
    </DashboardLayout>
  );
}
