import { createFileRoute, redirect } from "@tanstack/react-router";
import { hasPermission } from "@/features/rbac/utils/hasPermission";
import { readCurrentUserSync } from "@/features/auth/guards";
import { PartEditPage } from "@/features/catalog/pages/PartEditPage";

export const Route = createFileRoute("/app/catalogo/$id/editar")({
  beforeLoad: () => {
    const user = readCurrentUserSync();
    if (!hasPermission(user, "part", "edit")) {
      throw redirect({ to: "/app/catalogo" });
    }
  },
  component: PartEditPage,
});
