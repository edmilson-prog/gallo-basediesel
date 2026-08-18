import { createFileRoute, redirect } from "@tanstack/react-router";
import { hasPermission } from "@/features/rbac/utils/hasPermission";
import { readCurrentUserSync } from "@/features/auth/guards";
import { ModelKitFormPage } from "@/features/model-kits";
import { validateKitEditorSearch } from "@/features/model-kits/utils/kitEditorSearch";

function NovoKitPage() {
  return <ModelKitFormPage />;
}

export const Route = createFileRoute("/app/kits/$modelId/kit/novo")({
  validateSearch: validateKitEditorSearch,
  beforeLoad: () => {
    const user = readCurrentUserSync();
    if (!hasPermission(user, "modelKit", "create")) {
      throw redirect({ to: "/app/kits" });
    }
  },
  component: NovoKitPage,
});
