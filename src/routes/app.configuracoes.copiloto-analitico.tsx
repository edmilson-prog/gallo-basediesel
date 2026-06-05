import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { AnalyticsCopilotConfigPage } from "@/features/analytics-copilot/pages/AnalyticsCopilotConfigPage";

export const Route = createFileRoute("/app/configuracoes/copiloto-analitico")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner"]),
  component: () => (
    <SettingsLayout>
      <AnalyticsCopilotConfigPage />
    </SettingsLayout>
  ),
});
