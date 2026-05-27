import { createFileRoute } from "@tanstack/react-router";
import { requireAuth } from "@/features/auth/guards";
import { InsightsHubPage, validateInsightsSearch } from "@/features/insights";

export const Route = createFileRoute("/app/insights")({
  validateSearch: validateInsightsSearch,
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, ["Owner", "Gestor", "Financeiro"], {
      resource: "insight",
      action: "view",
    }),
  component: InsightsHubPage,
});
