import { createFileRoute } from "@tanstack/react-router";
import { SettingsLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { DepartmentsPage } from "@/features/people";

export const Route = createFileRoute("/app/configuracoes/departamentos")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, {
      resource: "seller",
      action: "edit",
      scope: "store",
    }),
  component: () => (
    <SettingsLayout>
      <DepartmentsPage />
    </SettingsLayout>
  ),
});
