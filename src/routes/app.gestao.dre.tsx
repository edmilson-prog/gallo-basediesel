import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { DREPage } from "@/features/dre";

export const Route = createFileRoute("/app/gestao/dre")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, { resource: "dre", action: "view" }),
  component: () => (
    <DashboardLayout>
      <DREPage />
    </DashboardLayout>
  ),
});
