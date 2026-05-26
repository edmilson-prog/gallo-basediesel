import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { VehicleCadastroModeSettingsPage } from "@/features/admin-settings";

export const Route = createFileRoute("/app/configuracoes/veiculos/cadastro-mode")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ["Owner"], { resource: "settings", action: "edit" }),
  component: () => (
    <SettingsLayout>
      <VehicleCadastroModeSettingsPage />
    </SettingsLayout>
  ),
});
