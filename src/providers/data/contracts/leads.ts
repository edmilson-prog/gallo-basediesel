import type { ID, ILead } from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

export interface IListLeadsParams extends IPaginationParams {
  storeId?: ID;
  sellerId?: ID;
  stageId?: ID;
  temperature?: ILead["temperature"];
  search?: string;
  /** When true, excludes leads with a `lossReason` set (server-side). Used by
   *  the kanban/list view to keep lost leads out of the 1000-row window. */
  excludeLost?: boolean;
}

/**
 * Contract for lead pipeline access.
 *
 * @see ../../../mocks/api/leads.ts
 * @see ../../../../docs/provider-pattern.md
 */
export interface ILeadsProvider {
  list(params?: IListLeadsParams): Promise<IPaginatedResult<ILead>>;
  get(id: ID): Promise<ILead>;
  create(input: Omit<ILead, "id" | "createdAt" | "updatedAt" | "conversations">): Promise<ILead>;
  update(id: ID, patch: Partial<ILead>): Promise<ILead>;
  delete(id: ID): Promise<void>;
}
