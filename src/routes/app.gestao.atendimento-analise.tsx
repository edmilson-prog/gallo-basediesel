import { createFileRoute, Outlet } from "@tanstack/react-router";
import { DashboardLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { validateCsaSearch } from "@/features/customer-service-analytics";

export const Route = createFileRoute("/app/gestao/atendimento-analise")({
  validateSearch: validateCsaSearch,
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, {
      resource: "customer_service_analytics",
      action: "view",
    }),
  component: () => (
    <DashboardLayout>
      <Outlet />
    </DashboardLayout>
  ),
});
