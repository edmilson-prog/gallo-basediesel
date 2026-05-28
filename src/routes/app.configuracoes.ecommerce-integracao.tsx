import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { EcommerceIntegrationConfigPage } from "@/features/ecommerce-integration";

export const Route = createFileRoute("/app/configuracoes/ecommerce-integracao")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ["Owner"], {
      resource: "ecommerce_integration",
      action: "edit",
    }),
  component: () => (
    <SettingsLayout>
      <EcommerceIntegrationConfigPage />
    </SettingsLayout>
  ),
});
