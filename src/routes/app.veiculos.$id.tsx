import { createFileRoute } from "@tanstack/react-router";
import { VehicleDetailPage } from "@/features/vehicles/pages/VehicleDetailPage";

export const Route = createFileRoute("/app/veiculos/$id")({
  component: VehicleDetailPage,
});
