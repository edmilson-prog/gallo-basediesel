import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { PortfolioAnalyticsPage, validatePortfolioSearch } from "@/features/portfolio-analytics";

export const Route = createFileRoute("/app/gestao/carteira-analitica")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ["Owner", "Gestor", "Vendedor", "Financeiro"]),
  validateSearch: validatePortfolioSearch,
  component: PortfolioAnalyticsPage,
});
