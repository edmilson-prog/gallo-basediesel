import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { SystemHealthPage } from "@/features/system-health";

export const Route = createFileRoute("/app/gestao/saude")({
  // PRD-110 RF-030: Owner-only — the database mirrors this with owner-scoped
  // RPCs, so the route guard is UX and the RLS layer is the security boundary.
  beforeLoad: ({ location }) => requireAuth(location.pathname, undefined, { resource: "monitor", action: "view" }),
  component: () => (
    <DashboardLayout>
      <SystemHealthPage />
    </DashboardLayout>
  ),
});
