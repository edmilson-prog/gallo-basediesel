import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { GamificationConfigPage } from "@/features/gamification/pages/GamificationConfigPage";

export const Route = createFileRoute("/app/configuracoes/gamificacao")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner"]),
  component: () => (
    <SettingsLayout>
      <GamificationConfigPage />
    </SettingsLayout>
  ),
});
