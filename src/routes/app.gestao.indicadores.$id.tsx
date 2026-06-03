import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { IndicatorDetailPage } from "@/features/indicators/pages/IndicatorDetailPage";

export const Route = createFileRoute("/app/gestao/indicadores/$id")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, [
      "Owner",
      "Gestor",
      "Vendedor",
      "VendedorExterno",
      "Financeiro",
    ]),
  component: IndicatorDetailPage,
});
