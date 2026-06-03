import { createFileRoute } from "@tanstack/react-router";
import { VehicleModelDetailPage } from "@/features/vehicle-models";

export const Route = createFileRoute("/app/kits/$modelId")({
  component: VehicleModelDetailPage,
});
