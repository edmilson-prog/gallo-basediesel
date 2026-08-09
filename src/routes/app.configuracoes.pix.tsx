import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { PixKeysPage } from "@/features/pix";

export const Route = createFileRoute("/app/configuracoes/pix")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, undefined, { resource: "settings", action: "edit" }),
  component: () => (
    <SettingsLayout>
      <PixKeysPage />
    </SettingsLayout>
  ),
});
