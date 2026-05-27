import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { ProfitabilityPage, validateProfitabilitySearch } from "@/features/profitability";

export const Route = createFileRoute("/app/gestao/rentabilidade")({
  validateSearch: validateProfitabilitySearch,
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, {
      resource: "profitability",
      action: "view",
    }),
  component: () => (
    <DashboardLayout>
      <ProfitabilityPage />
    </DashboardLayout>
  ),
});
