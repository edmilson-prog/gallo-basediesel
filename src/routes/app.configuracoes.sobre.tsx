import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { AboutPage } from "@/features/about";

export const Route = createFileRoute("/app/configuracoes/sobre")({
  beforeLoad: ({ location }) => requireAuth(location.pathname),
  component: () => (
    <SettingsLayout>
      <AboutPage />
    </SettingsLayout>
  ),
});
