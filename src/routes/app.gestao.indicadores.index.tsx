import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { IndicatorsPage } from "@/features/indicators/pages/IndicatorsPage";

export const Route = createFileRoute("/app/gestao/indicadores/")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ["Owner", "Gestor", "Vendedor", "Financeiro"]),
  component: IndicatorsPage,
});
