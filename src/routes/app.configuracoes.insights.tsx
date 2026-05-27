import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { InsightsConfigPage } from "@/features/insights";

export const Route = createFileRoute("/app/configuracoes/insights")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ["Owner"], { resource: "settings", action: "edit" }),
  component: () => (
    <SettingsLayout>
      <InsightsConfigPage />
    </SettingsLayout>
  ),
});
