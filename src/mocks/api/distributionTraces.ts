import type { DistributionMatchedCriterion, ID, IDistributionTrace } from "@/shared/types";
import { selectAllDistributionTraces, selectDistributionTraceById } from "../store/selectors";
import { upsert } from "../store/mutations";
import {
  MockNotFoundError,
  paginate,
  runApi,
  type IPaginatedResult,
  type IPaginationParams,
} from "./utils";

export interface IListDistributionTracesParams extends IPaginationParams {
  storeId?: ID;
  selectedSellerId?: ID;
  criterionMatched?: DistributionMatchedCriterion;
  /** ISO8601 inclusive lower bound. */
  since?: string;
  /** ISO8601 inclusive upper bound. */
  until?: string;
}

export const distributionTracesApi = {
  list(params: IListDistributionTracesParams = {}): Promise<IPaginatedResult<IDistributionTrace>> {
    return runApi(
      "distributionTracesApi",
      "list",
      () => {
        let all = selectAllDistributionTraces();
        if (params.storeId) all = all.filter((t) => t.storeId === params.storeId);
        if (params.selectedSellerId)
          all = all.filter((t) => t.selectedSellerId === params.selectedSellerId);
        if (params.criterionMatched)
          all = all.filter((t) => t.criterionMatched === params.criterionMatched);
        if (params.since) all = all.filter((t) => t.timestamp >= params.since!);
        if (params.until) all = all.filter((t) => t.timestamp <= params.until!);
        const sorted = [...all].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        return paginate(sorted, params);
      },
      { payload: params },
    );
  },

  async get(id: ID): Promise<IDistributionTrace> {
    return runApi("distributionTracesApi", "get", () => {
      const found = selectDistributionTraceById(id);
      if (!found) throw new MockNotFoundError("distribution_trace", id);
      return found;
    });
  },

  async create(trace: IDistributionTrace): Promise<IDistributionTrace> {
    return runApi(
      "distributionTracesApi",
      "create",
      () => {
        const saved = upsert("distributionTraces", trace);
        return saved;
      },
      { payload: { id: trace.id } },
    );
  },
};
