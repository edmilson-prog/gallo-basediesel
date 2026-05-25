import type { ISegmentsProvider } from "../contracts/segments";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useSegmentsProvider(): ISegmentsProvider {
  return useDataProviderSlice("segments", "useSegmentsProvider");
}
