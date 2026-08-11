import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { InboxPinsSettingsPage } from "@/features/admin-settings";

export const Route = createFileRoute("/app/configuracoes/atendimento/fixadas")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, { resource: "settings_automation", action: "edit" }),
  component: () => (
    <SettingsLayout>
      <InboxPinsSettingsPage />
    </SettingsLayout>
  ),
});
