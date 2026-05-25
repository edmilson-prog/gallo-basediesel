import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/features/shell/components/EmptyState";
import { DashboardLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";

export const Route = createFileRoute("/app/gestao/")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner"]),
  component: () => (
    <DashboardLayout>
      <PlaceholderPage prd="040" icon="mdi:view-dashboard" title="Visão executiva" />
    </DashboardLayout>
  ),
});
