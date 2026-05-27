import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { StorefrontConfigPage } from "@/features/storefront";

export const Route = createFileRoute("/app/configuracoes/storefront")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ["Owner"], { resource: "settings", action: "edit" }),
  component: () => (
    <SettingsLayout>
      <StorefrontConfigPage />
    </SettingsLayout>
  ),
});
