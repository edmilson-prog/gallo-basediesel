import type { INpsProvider } from "../contracts/nps";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useNpsProvider(): INpsProvider {
  return useDataProviderSlice("nps", "useNpsProvider");
}
