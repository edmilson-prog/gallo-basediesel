import type { IAuditLog, ID } from "@/shared/types";
import { selectAllAudits } from "../store/selectors";
import { upsert } from "../store/mutations";
import { paginate, runApi, type IPaginatedResult, type IPaginationParams } from "./utils";

export interface IListAuditsParams extends IPaginationParams {
  storeId?: ID;
  actorId?: ID;
  actorIds?: ID[];
  resource?: string;
  resources?: string[];
  resourceId?: ID;
  action?: string;
  actions?: string[];
  /** Lower bound on ISO timestamp (inclusive). */
  since?: string;
  /** Upper bound on ISO timestamp (inclusive). */
  until?: string;
}

export interface ICreateAuditInput {
  actorId: ID;
  action: string;
  resource: string;
  resourceId: ID;
  storeId: ID;
  before?: unknown;
  after?: unknown;
}

export const auditsApi = {
  list(params: IListAuditsParams = {}): Promise<IPaginatedResult<IAuditLog>> {
    return runApi(
      "auditsApi",
      "list",
      () => {
        let all = selectAllAudits();
        if (params.storeId) all = all.filter((a) => a.storeId === params.storeId);
        if (params.actorId) all = all.filter((a) => a.actorId === params.actorId);
        if (params.actorIds?.length) all = all.filter((a) => params.actorIds!.includes(a.actorId));
        if (params.resource) all = all.filter((a) => a.resource === params.resource);
        if (params.resources?.length)
          all = all.filter((a) => params.resources!.includes(a.resource));
        if (params.resourceId) all = all.filter((a) => a.resourceId === params.resourceId);
        if (params.action) all = all.filter((a) => a.action === params.action);
        if (params.actions?.length) all = all.filter((a) => params.actions!.includes(a.action));
        if (params.since) all = all.filter((a) => a.timestamp >= params.since!);
        if (params.until) all = all.filter((a) => a.timestamp <= params.until!);
        const sorted = [...all].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
        return paginate(sorted, params);
      },
      { payload: params },
    );
  },

  async create(input: ICreateAuditInput): Promise<IAuditLog> {
    return runApi(
      "auditsApi",
      "create",
      () => {
        const entry: IAuditLog = {
          id: `audit-${crypto.randomUUID()}`,
          actorId: input.actorId,
          action: input.action,
          resource: input.resource,
          resourceId: input.resourceId,
          storeId: input.storeId,
          before: input.before,
          after: input.after,
          timestamp: new Date().toISOString(),
        };
        upsert("audits", entry);
        return entry;
      },
      { payload: input },
    );
  },
};
