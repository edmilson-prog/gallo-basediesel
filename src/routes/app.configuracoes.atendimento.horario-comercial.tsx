import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { BusinessHoursSettingsPage } from "@/features/admin-settings";

export const Route = createFileRoute("/app/configuracoes/atendimento/horario-comercial")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ["Owner"], { resource: "settings", action: "edit" }),
  component: () => (
    <SettingsLayout>
      <BusinessHoursSettingsPage />
    </SettingsLayout>
  ),
});
