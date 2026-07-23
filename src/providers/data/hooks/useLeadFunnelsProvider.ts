import type { ILeadFunnelsProvider } from "../contracts/leadFunnels";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useLeadFunnelsProvider(): ILeadFunnelsProvider {
  return useDataProviderSlice("leadFunnels", "useLeadFunnelsProvider");
}
