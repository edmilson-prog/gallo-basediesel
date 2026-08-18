import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { WhatsAppAccountsPage } from "@/features/admin-settings";

export const Route = createFileRoute("/app/configuracoes/whatsapp")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, undefined, { resource: "settings_whatsapp", action: "edit" }),
  component: () => (
    <SettingsLayout>
      <WhatsAppAccountsPage />
    </SettingsLayout>
  ),
});
