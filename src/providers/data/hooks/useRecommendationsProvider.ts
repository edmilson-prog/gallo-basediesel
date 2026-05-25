import type { IRecommendationsProvider } from "../contracts/recommendations";
import { useDataProviderSlice } from "./_useDataProviderSlice";

export function useRecommendationsProvider(): IRecommendationsProvider {
  return useDataProviderSlice("recommendations", "useRecommendationsProvider");
}
