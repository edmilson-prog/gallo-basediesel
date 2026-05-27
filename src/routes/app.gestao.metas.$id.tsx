import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { GoalDetailPage } from "@/features/goals/pages/GoalDetailPage";

export const Route = createFileRoute("/app/gestao/metas/$id")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ["Owner", "Gestor", "Vendedor", "Financeiro"]),
  component: GoalDetailPage,
});
