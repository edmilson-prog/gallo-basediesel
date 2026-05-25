import type { ILeadsProvider } from "../contracts/leads";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useLeadsProvider(): ILeadsProvider {
  return useDataProviderSlice("leads", "useLeadsProvider");
}
