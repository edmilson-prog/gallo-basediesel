import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { EnvironmentModePage } from "@/features/admin-settings";

export const Route = createFileRoute("/app/configuracoes/ambiente")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner"]),
  component: () => (
    <SettingsLayout>
      <EnvironmentModePage />
    </SettingsLayout>
  ),
});
