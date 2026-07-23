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
  /**
   * `actorId` is the ISeller.id closing the transfer — used only to attribute
   * the audit_logs entry (`transfer.revert`). Optional because the auto-revert
   * timer has no human actor to attribute `transfer.expire` to; omit it there.
   */
  revert(transferId: ID, actorId?: ID): Promise<ICarteiraTransfer>;
  expire(transferId: ID, actorId?: ID): Promise<ICarteiraTransfer>;
}
