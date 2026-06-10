import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { TemplatesSettingsPage } from "@/features/templates";

export const Route = createFileRoute("/app/configuracoes/templates-whatsapp")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner", "Gestor"]),
  component: () => (
    <SettingsLayout>
      <TemplatesSettingsPage />
    </SettingsLayout>
  ),
});
