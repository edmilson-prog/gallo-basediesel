import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { InventoryAnalysisConfigPage } from "@/features/inventory-analytics";

export const Route = createFileRoute("/app/configuracoes/estoque-analise")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ["Owner"], { resource: "inventory", action: "edit" }),
  component: () => (
    <SettingsLayout>
      <InventoryAnalysisConfigPage />
    </SettingsLayout>
  ),
});
