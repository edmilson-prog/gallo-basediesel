import { createFileRoute } from "@tanstack/react-router";
import { PortalOrdersListPage } from "@/features/b2b-portal";

export const Route = createFileRoute("/portal/pedidos/")({
  component: PortalOrdersListPage,
});
