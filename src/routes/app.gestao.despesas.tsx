import { createFileRoute } from "@tanstack/react-router";
import { DashboardLayout } from "@/features/shell/layouts";
import { requireAuth } from "@/features/auth/guards";
import { ExpensesPage } from "@/features/expenses";
import {
  validateExpensesSearch,
  type IExpensesFiltersSearch,
} from "@/features/expenses/hooks/useExpensesFilters";

export const Route = createFileRoute("/app/gestao/despesas")({
  beforeLoad: ({ location }) =>
    requireAuth(location.pathname, undefined, { resource: "expense", action: "view" }),
  validateSearch: (search: Record<string, unknown>): IExpensesFiltersSearch =>
    validateExpensesSearch(search),
  component: () => (
    <DashboardLayout>
      <ExpensesPage />
    </DashboardLayout>
  ),
});
