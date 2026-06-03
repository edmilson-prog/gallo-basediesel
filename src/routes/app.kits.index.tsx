import { createFileRoute } from "@tanstack/react-router";
import { VehicleModelsListPage } from "@/features/vehicle-models";

export const Route = createFileRoute("/app/kits/")({
  component: VehicleModelsListPage,
});
