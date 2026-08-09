import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { CommissionsConfigPage } from "@/features/commissions";

export const Route = createFileRoute("/app/configuracoes/comissoes")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, undefined, { resource: "settings", action: "edit" }),
  component: () => (
    <SettingsLayout>
      <CommissionsConfigPage />
    </SettingsLayout>
  ),
});
