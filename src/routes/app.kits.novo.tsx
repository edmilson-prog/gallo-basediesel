import { createFileRoute, redirect } from "@tanstack/react-router";
import { hasPermission } from "@/features/rbac/utils/hasPermission";
import { readCurrentUserSync } from "@/features/auth/guards";
import { VehicleModelFormPage } from "@/features/vehicle-models";

function NovoModeloPage() {
  return <VehicleModelFormPage mode="create" />;
}

export const Route = createFileRoute("/app/kits/novo")({
  beforeLoad: () => {
    const user = readCurrentUserSync();
    if (!hasPermission(user, "vehicleModel", "create")) {
      throw redirect({ to: "/app/kits" });
    }
  },
  component: NovoModeloPage,
});
