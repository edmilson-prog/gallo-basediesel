import type { IAuditLog, ID } from "@/shared/types";
import { selectAllAudits } from "../store/selectors";
import { paginate, runApi, type IPaginatedResult, type IPaginationParams } from "./utils";

export interface IListAuditsParams extends IPaginationParams {
  actorId?: ID;
  resource?: string;
  resourceId?: ID;
}

export const auditsApi = {
  list(params: IListAuditsParams = {}): Promise<IPaginatedResult<IAuditLog>> {
    return runApi(
      "auditsApi",
      "list",
      () => {
        let all = selectAllAudits();
        if (params.actorId) all = all.filter((a) => a.actorId === params.actorId);
        if (params.resource) all = all.filter((a) => a.resource === params.resource);
        if (params.resourceId) all = all.filter((a) => a.resourceId === params.resourceId);
        const sorted = [...all].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        return paginate(sorted, params);
      },
      { payload: params },
    );
  },
};
