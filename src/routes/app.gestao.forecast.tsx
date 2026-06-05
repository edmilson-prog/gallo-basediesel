import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { SalesForecastPage, validateForecastSearch } from "@/features/sales-forecast";

export const Route = createFileRoute("/app/gestao/forecast")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner", "Gestor", "Financeiro"]),
  validateSearch: validateForecastSearch,
  component: SalesForecastPage,
});
