import { createFileRoute } from "@tanstack/react-router";
import { PortalRequestsPage } from "@/features/b2b-portal";

export const Route = createFileRoute("/portal/solicitacoes/")({
  component: PortalRequestsPage,
});
