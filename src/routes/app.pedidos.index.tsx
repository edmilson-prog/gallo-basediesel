import { createFileRoute } from "@tanstack/react-router";
import { OrdersListPage } from "@/features/orders/pages/OrdersListPage";
import { validateOrdersSearch } from "@/features/orders/hooks/useOrdersUrlState";

export const Route = createFileRoute("/app/pedidos/")({
  validateSearch: validateOrdersSearch,
  component: OrdersListPage,
});
