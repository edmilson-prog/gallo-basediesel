import { createFileRoute } from "@tanstack/react-router";
import { PortalVehicleDetailPage } from "@/features/b2b-portal";

export const Route = createFileRoute("/portal/frota/$id")({
  component: PortalVehicleDetailPage,
});
