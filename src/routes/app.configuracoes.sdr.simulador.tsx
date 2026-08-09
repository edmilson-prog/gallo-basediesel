import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { SdrSimulatorPage } from "@/features/sdr/pages/SdrSimulatorPage";

export const Route = createFileRoute("/app/configuracoes/sdr/simulador")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, undefined, { resource: "settings_sdr", action: "view" }),
  component: () => (
    <SettingsLayout>
      <SdrSimulatorPage />
    </SettingsLayout>
  ),
});
