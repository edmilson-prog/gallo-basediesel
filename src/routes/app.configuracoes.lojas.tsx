import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { StoresPage } from "@/features/multistore";

export const Route = createFileRoute("/app/configuracoes/lojas")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, { resource: "store", action: "view" }),
  component: () => (
    <SettingsLayout>
      <StoresPage />
    </SettingsLayout>
  ),
});
