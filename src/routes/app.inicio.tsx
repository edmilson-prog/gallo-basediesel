import { createFileRoute } from "@tanstack/react-router";
import { ManagerDashboardPage } from "@/features/manager-dashboard/pages/ManagerDashboardPage";
import { validateDashboardSearch } from "@/features/manager-dashboard/hooks/useDashboardFilters";

export const Route = createFileRoute("/app/inicio")({
  validateSearch: validateDashboardSearch,
  component: ManagerDashboardPage,
});
