import { recommendationsApi } from "@/mocks";
import type { IRecommendationsProvider } from "../../contracts/recommendations";
import { scopedListParams } from "./_storeScope";

export const mockRecommendationsProvider: IRecommendationsProvider = {
  list: (params) => recommendationsApi.list(scopedListParams(params, "recommendation")),
  resolve: (id) => recommendationsApi.resolve(id),
};
