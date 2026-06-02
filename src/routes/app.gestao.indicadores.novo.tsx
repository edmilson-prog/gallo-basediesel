import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { NewIndicatorPage } from "@/features/indicators/pages/NewIndicatorPage";

export const Route = createFileRoute("/app/gestao/indicadores/novo")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner", "Gestor"]),
  component: NewIndicatorPage,
});
