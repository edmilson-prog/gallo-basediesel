import type { IServiceKitsProvider } from "../contracts/serviceKits";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useServiceKitsProvider(): IServiceKitsProvider {
  return useDataProviderSlice("serviceKits", "useServiceKitsProvider");
}
