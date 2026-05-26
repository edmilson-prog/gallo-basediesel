import { createFileRoute, redirect } from "@tanstack/react-router";
import { hasPermission } from "@/features/rbac/utils/hasPermission";
import { readCurrentUserSync } from "@/features/auth/guards";
import { PartNewPage, validatePartNewSearch } from "@/features/catalog/pages/PartNewPage";

export const Route = createFileRoute("/app/catalogo/novo")({
  validateSearch: validatePartNewSearch,
  beforeLoad: () => {
    const user = readCurrentUserSync();
    if (!hasPermission(user, "part", "create")) {
      throw redirect({ to: "/app/catalogo" });
    }
  },
  component: PartNewPage,
});
