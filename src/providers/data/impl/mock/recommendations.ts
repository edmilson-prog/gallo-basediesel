import { recommendationsApi } from "@/mocks";
import type { IRecommendationsProvider } from "../../contracts/recommendations";

export const mockRecommendationsProvider: IRecommendationsProvider = {
  list: (params) => recommendationsApi.list(params),
  resolve: (id) => recommendationsApi.resolve(id),
};
