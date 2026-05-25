import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/features/shell/components/EmptyState";
import { DashboardLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";

export const Route = createFileRoute("/app/gestao/estoque")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner"]),
  component: () => (
    <DashboardLayout>
      <PlaceholderPage prd="052" icon="mdi:warehouse" title="Estoque com curadoria" />
    </DashboardLayout>
  ),
});
