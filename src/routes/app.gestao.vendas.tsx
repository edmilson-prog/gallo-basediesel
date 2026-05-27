import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { SalesAnalyticsPage, validateSalesSearch } from "@/features/sales-analytics";

export const Route = createFileRoute("/app/gestao/vendas")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ["Owner", "Gestor", "Vendedor", "Financeiro"]),
  validateSearch: validateSalesSearch,
  component: SalesAnalyticsPage,
});
