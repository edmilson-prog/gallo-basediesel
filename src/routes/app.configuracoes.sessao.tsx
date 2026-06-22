import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { SessionSettingsPage } from "@/features/admin-settings/pages/SessionSettingsPage";

export const Route = createFileRoute("/app/configuracoes/sessao")({
  beforeLoad: ({ location }) => {
    requireAuth(location.pathname, ["Owner"]);
  },
  component: () => (
    <SettingsLayout>
      <SessionSettingsPage />
    </SettingsLayout>
  ),
});
