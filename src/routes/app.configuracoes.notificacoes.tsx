import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { NotificationPreferencesPage } from "@/features/notifications/pages/NotificationPreferencesPage";

export const Route = createFileRoute("/app/configuracoes/notificacoes")({
  beforeLoad: ({ location }) => requireAuth(location.pathname),
  component: () => (
    <SettingsLayout>
      <NotificationPreferencesPage />
    </SettingsLayout>
  ),
});
