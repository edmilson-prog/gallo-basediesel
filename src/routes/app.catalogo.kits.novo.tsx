import { createFileRoute, redirect } from "@tanstack/react-router";
import { hasPermission } from "@/features/rbac/utils/hasPermission";
import { readCurrentUserSync } from "@/features/auth/guards";
import { ServiceKitFormPage } from "@/features/service-kits";

function KitsNovoPage() {
  return <ServiceKitFormPage mode="create" />;
}

export const Route = createFileRoute("/app/catalogo/kits/novo")({
  beforeLoad: () => {
    const user = readCurrentUserSync();
    if (!hasPermission(user, "serviceKit", "create")) {
      throw redirect({ to: "/app/catalogo/kits" });
    }
  },
  component: KitsNovoPage,
});
