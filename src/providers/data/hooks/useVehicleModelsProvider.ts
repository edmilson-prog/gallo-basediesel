import type { IVehicleModelsProvider } from "../contracts/vehicleModels";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useVehicleModelsProvider(): IVehicleModelsProvider {
  return useDataProviderSlice("vehicleModels", "useVehicleModelsProvider");
}
