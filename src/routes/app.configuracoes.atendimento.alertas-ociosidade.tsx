import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { IdleAlertsSettingsPage } from "@/features/admin-settings";

export const Route = createFileRoute("/app/configuracoes/atendimento/alertas-ociosidade")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ["Owner"], { resource: "settings", action: "edit" }),
  component: () => (
    <SettingsLayout>
      <IdleAlertsSettingsPage />
    </SettingsLayout>
  ),
});
