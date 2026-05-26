import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";

export const Route = createFileRoute("/app")({
  beforeLoad: ({ location }) => {
    requireAuth(location.pathname, ["Owner", "Gestor", "Vendedor"]);
  },
  component: AppLayoutRoute,
});

function AppLayoutRoute() {
  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
