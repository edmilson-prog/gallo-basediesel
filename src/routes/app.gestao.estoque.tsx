import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { InventoryAnalyticsPage, validateInventorySearch } from "@/features/inventory-analytics";

export const Route = createFileRoute("/app/gestao/estoque")({
  validateSearch: validateInventorySearch,
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, {
      resource: "inventory",
      action: "view",
    }),
  component: () => (
    <DashboardLayout>
      <InventoryAnalyticsPage />
    </DashboardLayout>
  ),
});
