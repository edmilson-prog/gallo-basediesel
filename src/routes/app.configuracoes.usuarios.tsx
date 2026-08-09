import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { UsersPage } from "@/features/admin-settings";

export const Route = createFileRoute("/app/configuracoes/usuarios")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, undefined, { resource: "settings_users", action: "view" }),
  component: () => (
    <SettingsLayout>
      <UsersPage />
    </SettingsLayout>
  ),
});
