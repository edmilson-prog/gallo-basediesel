import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { SdrQuoteSettingsPage } from "@/features/sdr-quote/pages/SdrQuoteSettingsPage";

export const Route = createFileRoute("/app/configuracoes/sdr/orcamento")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner", "Gestor"]),
  component: () => (
    <SettingsLayout>
      <SdrQuoteSettingsPage />
    </SettingsLayout>
  ),
});
