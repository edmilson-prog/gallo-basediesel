import { indicatorsApi } from "@/mocks";
import type { IIndicatorsProvider } from "../../contracts/indicators";
import { scopedListParams } from "./_storeScope";

export const mockIndicatorsProvider: IIndicatorsProvider = {
  list: (params) => indicatorsApi.list(scopedListParams(params, "indicator")),
  upsert: (indicator) => indicatorsApi.upsert(indicator),
  update: (id, patch) => indicatorsApi.update(id, patch),
};
