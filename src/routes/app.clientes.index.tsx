import { createFileRoute } from "@tanstack/react-router";
import { CustomersListPage } from "@/features/customers/pages/CustomersListPage";
import { validateCustomersSearch } from "@/features/customers/hooks/useCustomersUrlState";

export const Route = createFileRoute("/app/clientes/")({
  validateSearch: validateCustomersSearch,
  component: CustomersListPage,
});
