import { distributionTracesApi } from "@/mocks";
import type { IDistributionTracesProvider } from "../../contracts/distributionTraces";
import { scopedListParams } from "./_storeScope";

export const mockDistributionTracesProvider: IDistributionTracesProvider = {
  list: (params) => distributionTracesApi.list(scopedListParams(params, "conversation")),
  get: (id) => distributionTracesApi.get(id),
  create: (trace) => distributionTracesApi.create(trace),
};
