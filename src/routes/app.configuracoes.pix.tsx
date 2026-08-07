import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { PixKeysPage } from "@/features/pix";

export const Route = createFileRoute("/app/configuracoes/pix")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner", "Gestor"]),
  component: () => (
    <SettingsLayout>
      <PixKeysPage />
    </SettingsLayout>
  ),
});
