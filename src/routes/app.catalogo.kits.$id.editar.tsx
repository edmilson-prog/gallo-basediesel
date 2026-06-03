import { createFileRoute, redirect } from "@tanstack/react-router";
import { hasPermission } from "@/features/rbac/utils/hasPermission";
import { readCurrentUserSync } from "@/features/auth/guards";
import { ServiceKitFormPage } from "@/features/service-kits";

function KitsEditarPage() {
  return <ServiceKitFormPage mode="edit" />;
}

export const Route = createFileRoute("/app/catalogo/kits/$id/editar")({
  beforeLoad: () => {
    const user = readCurrentUserSync();
    if (!hasPermission(user, "serviceKit", "edit")) {
      throw redirect({ to: "/app/catalogo/kits" });
    }
  },
  component: KitsEditarPage,
});
