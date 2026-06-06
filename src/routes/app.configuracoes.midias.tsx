import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { MediaRetentionSettingsPage } from "@/features/admin-settings";

export const Route = createFileRoute("/app/configuracoes/midias")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ["Owner", "Gestor"]),
  component: () => (
    <SettingsLayout>
      <MediaRetentionSettingsPage />
    </SettingsLayout>
  ),
});
