import type { IVehiclesProvider } from "../contracts/vehicles";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useVehiclesProvider(): IVehiclesProvider {
  return useDataProviderSlice("vehicles", "useVehiclesProvider");
}
