import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { LossReasonsSettingsPage } from "@/features/admin-settings";

export const Route = createFileRoute("/app/configuracoes/atendimento/motivos-perda")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, { resource: "settings", action: "view" }),
  component: () => (
    <SettingsLayout>
      <LossReasonsSettingsPage />
    </SettingsLayout>
  ),
});
