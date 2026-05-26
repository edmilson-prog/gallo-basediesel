import { createFileRoute } from "@tanstack/react-router";
import { VehiclesListPage } from "@/features/vehicles/pages/VehiclesListPage";
import { validateVehiclesSearch } from "@/features/vehicles/hooks/useVehiclesUrlState";

export const Route = createFileRoute("/app/veiculos/")({
  validateSearch: validateVehiclesSearch,
  component: VehiclesListPage,
});
