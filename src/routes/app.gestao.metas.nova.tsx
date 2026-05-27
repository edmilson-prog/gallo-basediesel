import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { NewGoalPage } from "@/features/goals/pages/NewGoalPage";

export const Route = createFileRoute("/app/gestao/metas/nova")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner", "Gestor"]),
  component: NewGoalPage,
});
