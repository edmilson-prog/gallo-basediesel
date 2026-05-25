import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { RolesPage } from "@/features/rbac/pages/RolesPage";

export const Route = createFileRoute("/app/configuracoes/papeis")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, { resource: "role", action: "view" }),
  component: () => (
    <SettingsLayout>
      <RolesPage />
    </SettingsLayout>
  ),
});
