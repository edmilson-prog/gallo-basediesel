import type { ICommission, ID } from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

export interface IListCommissionsParams extends IPaginationParams {
  storeId?: ID;
  sellerId?: ID;
  status?: ICommission["status"];
  period?: string;
}

/**
 * Contract for seller commissions access.
 *
 * @see ../../../mocks/api/commissions.ts
 * @see ../../../../docs/provider-pattern.md
 */
export interface ICommissionsProvider {
  list(params?: IListCommissionsParams): Promise<IPaginatedResult<ICommission>>;
  update(id: ID, patch: Partial<ICommission>): Promise<ICommission>;
}
