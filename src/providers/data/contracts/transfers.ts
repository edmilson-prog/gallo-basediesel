import type { CarteiraTransferType, ICarteiraTransfer, ID } from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

export interface IListTransfersParams extends IPaginationParams {
  storeId?: ID;
  fromSellerId?: ID;
  toSellerId?: ID;
  status?: ICarteiraTransfer["status"];
  statuses?: ICarteiraTransfer["status"][];
  types?: CarteiraTransferType[];
  since?: string;
  until?: string;
}

export interface ICreateTransferInput {
  storeId: ID;
  type: CarteiraTransferType;
  fromSellerId: ID;
  toSellerId: ID;
  customerIds: ID[];
  reason: string;
  startDate?: string;
  endDate?: string;
  createdBy: ID;
}

/**
 * Contract for customer carteira transfer access.
 *
 * @see ../../../mocks/api/transfers.ts
 * @see ../../../../docs/provider-pattern.md
 */
export interface ITransfersProvider {
  list(params?: IListTransfersParams): Promise<IPaginatedResult<ICarteiraTransfer>>;
  create(input: ICreateTransferInput): Promise<ICarteiraTransfer>;
  revert(transferId: ID): Promise<ICarteiraTransfer>;
  expire(transferId: ID): Promise<ICarteiraTransfer>;
}
