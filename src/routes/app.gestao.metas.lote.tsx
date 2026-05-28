import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { BatchGoalsPage } from "@/features/goals/pages/BatchGoalsPage";

export const Route = createFileRoute("/app/gestao/metas/lote")({
  beforeLoad: ({ location }) => requireAuth(location.pathname, ["Owner", "Gestor"]),
  component: BatchGoalsPage,
});
