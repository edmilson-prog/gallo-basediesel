import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { SessionSettingsPage } from "@/features/admin-settings/pages/SessionSettingsPage";

export const Route = createFileRoute("/app/configuracoes/sessao")({
  beforeLoad: ({ location }) => {
    requireAuth(location.pathname, undefined, { resource: "settings_system", action: "edit" });
  },
  component: () => (
    <SettingsLayout>
      <SessionSettingsPage />
    </SettingsLayout>
  ),
});
