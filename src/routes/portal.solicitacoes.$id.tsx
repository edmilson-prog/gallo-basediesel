import { createFileRoute } from "@tanstack/react-router";
import { PortalRequestDetailPage } from "@/features/b2b-portal";

export const Route = createFileRoute("/portal/solicitacoes/$id")({
  component: PortalRequestDetailPage,
});
