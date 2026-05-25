import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/features/shell/components/EmptyState";
import { DashboardLayout } from "@/features/shell/layouts";

export const Route = createFileRoute("/app/gestao/ranking")({
  component: () => (
    <DashboardLayout>
      <PlaceholderPage prd="043" icon="mdi:trophy" title="Ranking de vendedores" />
    </DashboardLayout>
  ),
});
