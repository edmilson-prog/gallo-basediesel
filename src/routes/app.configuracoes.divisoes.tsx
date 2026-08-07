import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { DivisionsPlaceholderPage } from "@/features/admin-settings";

export const Route = createFileRoute("/app/configuracoes/divisoes")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner", "Gestor"]),
  component: () => (
    <SettingsLayout>
      <DivisionsPlaceholderPage />
    </SettingsLayout>
  ),
});
