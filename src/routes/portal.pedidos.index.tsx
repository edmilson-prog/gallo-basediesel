import { createFileRoute } from "@tanstack/react-router";
import { PortalOrdersListPage, type IPortalOrdersSearch } from "@/features/b2b-portal";

export const Route = createFileRoute("/portal/pedidos/")({
  validateSearch: (search: Record<string, unknown>): IPortalOrdersSearch => ({
    vehicleId: typeof search.vehicleId === "string" ? search.vehicleId : undefined,
  }),
  component: PortalOrdersListPage,
});
