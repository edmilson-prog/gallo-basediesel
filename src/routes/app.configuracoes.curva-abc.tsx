import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { ABCSettingsPage } from "@/features/abc-curve";
import { SettingsLayout } from "@/features/shell/layouts";

export const Route = createFileRoute("/app/configuracoes/curva-abc")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner"]),
  component: () => (
    <SettingsLayout>
      <ABCSettingsPage />
    </SettingsLayout>
  ),
});
