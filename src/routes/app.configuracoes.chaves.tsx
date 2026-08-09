import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { IntegrationKeysPage } from "@/features/admin-settings";

export const Route = createFileRoute("/app/configuracoes/chaves")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, undefined, { resource: "settings_api_keys", action: "view" }),
  component: () => (
    <SettingsLayout>
      <IntegrationKeysPage />
    </SettingsLayout>
  ),
});
