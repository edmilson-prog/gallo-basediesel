import type { ICarteiraTransfer, ID } from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

export interface IListTransfersParams extends IPaginationParams {
  storeId?: ID;
  fromSellerId?: ID;
  toSellerId?: ID;
  status?: ICarteiraTransfer["status"];
}

/**
 * Contract for customer carteira transfer access.
 *
 * @see ../../../mocks/api/transfers.ts
 * @see ../../../../docs/provider-pattern.md
 */
export interface ITransfersProvider {
  list(params?: IListTransfersParams): Promise<IPaginatedResult<ICarteiraTransfer>>;
}
