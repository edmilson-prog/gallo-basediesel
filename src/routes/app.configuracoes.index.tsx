import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/features/shell/components/EmptyState";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";

export const Route = createFileRoute("/app/configuracoes/")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner"]),
  component: () => (
    <SettingsLayout>
      <PlaceholderPage prd="019" icon="mdi:cog-outline" title="Configurações administrativas" />
    </SettingsLayout>
  ),
});
