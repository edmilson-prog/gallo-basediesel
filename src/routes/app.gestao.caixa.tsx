import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { CashFlowPage } from "@/features/cashflow";
import {
  validateCashFlowSearch,
  type ICashFlowFiltersSearch,
} from "@/features/cashflow/hooks/useCashFlowFilters";

export const Route = createFileRoute("/app/gestao/caixa")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, { resource: "cashflow", action: "view" }),
  validateSearch: (search: Record<string, unknown>): ICashFlowFiltersSearch =>
    validateCashFlowSearch(search),
  component: () => (
    <DashboardLayout>
      <CashFlowPage />
    </DashboardLayout>
  ),
});
