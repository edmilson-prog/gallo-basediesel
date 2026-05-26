import type { ID, IRecommendation } from "@/shared/types";
import { selectAllRecommendations } from "../store/selectors";
import { patchById } from "../store/mutations";
import {
  MockNotFoundError,
  paginate,
  runApi,
  type IPaginatedResult,
  type IPaginationParams,
} from "./utils";

export interface IListRecommendationsParams extends IPaginationParams {
  storeId?: ID;
  sellerId?: ID;
  subjectId?: ID;
  resolved?: boolean;
  type?: IRecommendation["type"] | IRecommendation["type"][];
}

export const recommendationsApi = {
  list(params: IListRecommendationsParams = {}): Promise<IPaginatedResult<IRecommendation>> {
    return runApi(
      "recommendationsApi",
      "list",
      () => {
        let all = selectAllRecommendations();
        if (params.storeId) all = all.filter((r) => r.storeId === params.storeId);
        if (params.sellerId) all = all.filter((r) => r.sellerId === params.sellerId);
        if (params.subjectId) all = all.filter((r) => r.subjectId === params.subjectId);
        if (typeof params.resolved === "boolean")
          all = all.filter((r) => r.resolved === params.resolved);
        if (params.type) {
          const allowed = Array.isArray(params.type)
            ? new Set(params.type)
            : new Set([params.type]);
          all = all.filter((r) => allowed.has(r.type));
        }
        const sorted = [...all].sort((a, b) => priorityScore(b) - priorityScore(a));
        return paginate(sorted, params);
      },
      { payload: params },
    );
  },

  async resolve(id: ID): Promise<IRecommendation> {
    return runApi("recommendationsApi", "resolve", () => {
      const updated = patchById("recommendations", id, {
        resolved: true,
        resolvedAt: new Date().toISOString(),
      });
      if (!updated) throw new MockNotFoundError("recommendation", id);
      return updated;
    });
  },
};

function priorityScore(r: IRecommendation): number {
  switch (r.priority) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
  }
}
