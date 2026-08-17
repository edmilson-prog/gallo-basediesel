import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { SuppliersListPage } from "@/features/suppliers";

export const Route = createFileRoute("/app/financeiro/fornecedores")({
  // Permission only, no `roles` ceiling: the two combine with AND, and a
  // ceiling here would make granting `supplier` in the Role Editor inert.
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, { resource: "supplier", action: "view" }),
  component: () => (
    <DashboardLayout>
      <SuppliersListPage />
    </DashboardLayout>
  ),
});
