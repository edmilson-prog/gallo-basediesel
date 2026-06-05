// src/routes/app.gestao.copiloto.tsx
import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { AnalyticsCopilotPage } from "@/features/analytics-copilot";

export const Route = createFileRoute("/app/gestao/copiloto")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ["Owner", "Gestor", "Vendedor", "Financeiro"]),
  component: AnalyticsCopilotPage,
});
