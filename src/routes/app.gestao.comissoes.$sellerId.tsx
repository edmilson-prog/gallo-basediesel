import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { SellerCommissionsPage, validateCommissionsSearch } from "@/features/commissions";

export const Route = createFileRoute("/app/gestao/comissoes/$sellerId")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ["Owner", "Gestor", "Vendedor", "Financeiro"]),
  validateSearch: validateCommissionsSearch,
  component: SellerCommissionsPage,
});
