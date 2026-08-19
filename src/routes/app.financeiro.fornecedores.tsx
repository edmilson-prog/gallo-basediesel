import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { SuppliersListPage } from "@/features/suppliers";

// No `DashboardLayout` wrapper: the page manages its own fixed-header +
// scrolling-body shell via a viewport-relative height (see
// SuppliersListPage.tsx), the same contract CatalogListPage/VehiclesListPage
// rely on. DashboardLayout's `py-6` would add unaccounted scroll room in
// `main` and drag the fixed header along with it.
export const Route = createFileRoute("/app/financeiro/fornecedores")({
  // Permission only, no `roles` ceiling: the two combine with AND, and a
  // ceiling here would make granting `supplier` in the Role Editor inert.
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, { resource: "supplier", action: "view" }),
  component: SuppliersListPage,
});
