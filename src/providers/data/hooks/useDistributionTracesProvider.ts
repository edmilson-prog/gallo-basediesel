import type { IDistributionTracesProvider } from "../contracts/distributionTraces";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useDistributionTracesProvider(): IDistributionTracesProvider {
  return useDataProviderSlice("distributionTraces", "useDistributionTracesProvider");
}
