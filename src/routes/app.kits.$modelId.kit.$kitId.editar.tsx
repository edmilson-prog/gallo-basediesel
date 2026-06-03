import { createFileRoute, redirect } from "@tanstack/react-router";
import { hasPermission } from "@/features/rbac/utils/hasPermission";
import { readCurrentUserSync } from "@/features/auth/guards";
import { ModelKitFormPage } from "@/features/model-kits";

function EditarKitPage() {
  return <ModelKitFormPage />;
}

export const Route = createFileRoute("/app/kits/$modelId/kit/$kitId/editar")({
  beforeLoad: () => {
    const user = readCurrentUserSync();
    if (!hasPermission(user, "modelKit", "edit")) {
      throw redirect({ to: "/app/kits" });
    }
  },
  component: EditarKitPage,
});
