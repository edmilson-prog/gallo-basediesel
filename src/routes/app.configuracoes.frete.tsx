import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { ShippingConfigPage } from "@/features/shipping/pages/ShippingConfigPage";

export const Route = createFileRoute("/app/configuracoes/frete")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ["Owner", "Gestor"], {
      resource: "settings",
      action: "view",
    }),
  component: () => (
    <SettingsLayout>
      <ShippingConfigPage />
    </SettingsLayout>
  ),
});
