import type { ISystemHealthProvider } from "../contracts/systemHealth";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useSystemHealthProvider(): ISystemHealthProvider {
  return useDataProviderSlice("systemHealth", "useSystemHealthProvider");
}
