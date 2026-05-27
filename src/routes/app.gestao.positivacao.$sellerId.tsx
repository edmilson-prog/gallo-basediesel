import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { SellerPositivationPage, validatePositivationSearch } from "@/features/positivation";

export const Route = createFileRoute("/app/gestao/positivacao/$sellerId")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ["Owner", "Gestor", "Vendedor", "Financeiro"]),
  validateSearch: validatePositivationSearch,
  component: SellerPositivationPage,
});
