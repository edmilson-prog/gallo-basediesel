import type { ICommissionsProvider } from "../contracts/commissions";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useCommissionsProvider(): ICommissionsProvider {
  return useDataProviderSlice("commissions", "useCommissionsProvider");
}
