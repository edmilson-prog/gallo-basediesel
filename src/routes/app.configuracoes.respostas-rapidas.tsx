import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { QuickRepliesPage } from "@/features/quick-send";

export const Route = createFileRoute("/app/configuracoes/respostas-rapidas")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ["Owner", "Gestor", "Vendedor", "SDR"]),
  component: () => (
    <SettingsLayout>
      <QuickRepliesPage />
    </SettingsLayout>
  ),
});
