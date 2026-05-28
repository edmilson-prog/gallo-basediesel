import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { StorefrontAdminPage, type IStorefrontAdminSearch } from "@/features/storefront-admin";

export const Route = createFileRoute("/app/storefront-admin")({
  validateSearch: (search: Record<string, unknown>): IStorefrontAdminSearch => ({
    tab: typeof search.tab === "string" ? search.tab : undefined,
    subtab: typeof search.subtab === "string" ? search.subtab : undefined,
  }),
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ["Owner", "Gestor"], {
      resource: "storefront_admin",
      action: "view",
    }),
  component: StorefrontAdminPage,
});
