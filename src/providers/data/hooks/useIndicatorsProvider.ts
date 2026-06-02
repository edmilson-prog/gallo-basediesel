import type { IIndicatorsProvider } from "../contracts/indicators";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useIndicatorsProvider(): IIndicatorsProvider {
  return useDataProviderSlice("indicators", "useIndicatorsProvider");
}
