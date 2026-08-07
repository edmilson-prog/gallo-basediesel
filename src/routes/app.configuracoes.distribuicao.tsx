import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { DistributionRulesPanel } from "@/features/distribution/pages/DistributionRulesPanel";

export const Route = createFileRoute("/app/configuracoes/distribuicao")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, {
      resource: "settings",
      action: "edit",
    }),
  component: () => (
    <SettingsLayout>
      <DistributionRulesPanel />
    </SettingsLayout>
  ),
});
