import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { TemplatesSettingsPage } from "@/features/templates";

export const Route = createFileRoute("/app/configuracoes/templates-whatsapp")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, undefined, { resource: "settings_whatsapp", action: "view" }),
  component: () => (
    <SettingsLayout>
      <TemplatesSettingsPage />
    </SettingsLayout>
  ),
});
