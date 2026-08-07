import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { ForecastConfigPage } from "@/features/sales-forecast/pages/ForecastConfigPage";

export const Route = createFileRoute("/app/configuracoes/forecast")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner", "Gestor"]),
  component: () => (
    <SettingsLayout>
      <ForecastConfigPage />
    </SettingsLayout>
  ),
});
