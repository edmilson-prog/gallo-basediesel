import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { ConversationRescueSettingsPage } from "@/features/admin-settings";

export const Route = createFileRoute("/app/configuracoes/atendimento/resgate-conversas")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, { resource: "settings_automation", action: "edit" }),
  component: () => (
    <SettingsLayout>
      <ConversationRescueSettingsPage />
    </SettingsLayout>
  ),
});
