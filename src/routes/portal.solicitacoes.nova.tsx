import { createFileRoute } from "@tanstack/react-router";
import { PortalNewRequestPage, type IPortalNewRequestSearch } from "@/features/b2b-portal";

export const Route = createFileRoute("/portal/solicitacoes/nova")({
  validateSearch: (search: Record<string, unknown>): IPortalNewRequestSearch => ({
    vehicleId: typeof search.vehicleId === "string" ? search.vehicleId : undefined,
  }),
  component: PortalNewRequestPage,
});
