import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { GamificationPlaceholderPage } from "@/features/admin-settings";

export const Route = createFileRoute("/app/configuracoes/gamificacao")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner"]),
  component: () => (
    <SettingsLayout>
      <GamificationPlaceholderPage />
    </SettingsLayout>
  ),
});
