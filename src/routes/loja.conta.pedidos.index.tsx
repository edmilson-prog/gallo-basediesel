import { createFileRoute } from "@tanstack/react-router";
import { AccountOrdersPage } from "@/features/storefront-account";

export const Route = createFileRoute("/loja/conta/pedidos/")({
  component: AccountOrdersPage,
});
