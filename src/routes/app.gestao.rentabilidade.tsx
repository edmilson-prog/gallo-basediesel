import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/features/shell/components/EmptyState";
import { DashboardLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";

export const Route = createFileRoute("/app/gestao/rentabilidade")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner"]),
  component: () => (
    <DashboardLayout>
      <PlaceholderPage prd="049" icon="mdi:scale-balance" title="Rentabilidade" />
    </DashboardLayout>
  ),
});
