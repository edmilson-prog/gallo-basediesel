import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { LifecycleSettingsPage } from "@/features/admin-settings";

export const Route = createFileRoute("/app/configuracoes/atendimento/lifecycle")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, { resource: "settings", action: "edit" }),
  component: () => (
    <SettingsLayout>
      <LifecycleSettingsPage />
    </SettingsLayout>
  ),
});
