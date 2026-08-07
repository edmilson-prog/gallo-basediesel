import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { SdrTemplatesPage } from "@/features/sdr/pages/SdrTemplatesPage";

export const Route = createFileRoute("/app/configuracoes/sdr/templates")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, {
      resource: "settings",
      action: "edit",
    }),
  component: () => (
    <SettingsLayout>
      <SdrTemplatesPage />
    </SettingsLayout>
  ),
});
