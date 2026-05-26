import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { PortalPlaceholderPage } from "@/features/admin-settings";

export const Route = createFileRoute("/app/configuracoes/portal-cliente")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner"]),
  component: () => (
    <SettingsLayout>
      <PortalPlaceholderPage />
    </SettingsLayout>
  ),
});
