import { createFileRoute } from "@tanstack/react-router";
import { PortalOrderDetailPage } from "@/features/b2b-portal";

export const Route = createFileRoute("/portal/pedidos/$id")({
  component: PortalOrderDetailPage,
});
