import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { hasPermission } from "@/features/rbac/utils/hasPermission";
import { readCurrentUserSync } from "@/features/auth/guards";

function KitsLayout() {
  return <Outlet />;
}

export const Route = createFileRoute("/app/catalogo/kits")({
  beforeLoad: () => {
    const user = readCurrentUserSync();
    if (!hasPermission(user, "serviceKit", "view")) {
      throw redirect({ to: "/app/catalogo" });
    }
  },
  component: KitsLayout,
});
