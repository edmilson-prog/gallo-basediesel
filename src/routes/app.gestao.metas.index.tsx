import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { GoalsPage, validateGoalsSearch } from "@/features/goals";

export const Route = createFileRoute("/app/gestao/metas/")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ["Owner", "Gestor", "Vendedor", "Financeiro"]),
  validateSearch: validateGoalsSearch,
  component: GoalsPage,
});
