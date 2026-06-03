import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { hasPermission } from "@/features/rbac/utils/hasPermission";
import { readCurrentUserSync } from "@/features/auth/guards";

function KitsByModelLayout() {
  return <Outlet />;
}

export const Route = createFileRoute("/app/kits")({
  beforeLoad: () => {
    const user = readCurrentUserSync();
    if (!hasPermission(user, "vehicleModel", "view")) {
      throw redirect({ to: "/app/inicio" });
    }
  },
  component: KitsByModelLayout,
});
