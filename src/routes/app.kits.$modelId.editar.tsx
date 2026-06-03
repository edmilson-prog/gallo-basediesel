import { createFileRoute, redirect } from "@tanstack/react-router";
import { hasPermission } from "@/features/rbac/utils/hasPermission";
import { readCurrentUserSync } from "@/features/auth/guards";
import { VehicleModelFormPage } from "@/features/vehicle-models";

function EditarModeloPage() {
  return <VehicleModelFormPage mode="edit" />;
}

export const Route = createFileRoute("/app/kits/$modelId/editar")({
  beforeLoad: () => {
    const user = readCurrentUserSync();
    if (!hasPermission(user, "vehicleModel", "edit")) {
      throw redirect({ to: "/app/kits" });
    }
  },
  component: EditarModeloPage,
});
