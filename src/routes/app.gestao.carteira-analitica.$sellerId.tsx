import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { SellerPortfolioPage, validatePortfolioSearch } from "@/features/portfolio-analytics";

export const Route = createFileRoute("/app/gestao/carteira-analitica/$sellerId")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ["Owner", "Gestor", "Vendedor", "Financeiro"]),
  validateSearch: validatePortfolioSearch,
  component: SellerPortfolioPage,
});
