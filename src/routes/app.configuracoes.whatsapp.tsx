import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { WhatsAppPlaceholderPage } from "@/features/admin-settings";

export const Route = createFileRoute("/app/configuracoes/whatsapp")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner"]),
  component: () => (
    <SettingsLayout>
      <WhatsAppPlaceholderPage />
    </SettingsLayout>
  ),
});
