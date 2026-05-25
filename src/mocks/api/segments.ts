import type { ICustomerSegment, ID } from "@/shared/types";
import { selectAllSegments } from "../store/selectors";
import { paginate, runApi, type IPaginatedResult, type IPaginationParams } from "./utils";

export interface IListSegmentsParams extends IPaginationParams {
  scope?: ICustomerSegment["scope"];
  ownerId?: ID;
}

export const segmentsApi = {
  list(params: IListSegmentsParams = {}): Promise<IPaginatedResult<ICustomerSegment>> {
    return runApi(
      "segmentsApi",
      "list",
      () => {
        let all = selectAllSegments();
        if (params.scope) all = all.filter((s) => s.scope === params.scope);
        if (params.ownerId) all = all.filter((s) => s.ownerId === params.ownerId);
        return paginate(all, params);
      },
      { payload: params },
    );
  },
};
