import type {
  CommissionStatus,
  ICommission,
  ID,
} from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

export interface IListCommissionsParams extends IPaginationParams {
  storeId?: ID;
  sellerId?: ID;
  sellerIds?: ID[];
  status?: CommissionStatus;
  statuses?: CommissionStatus[];
  period?: string;
}

/** Subset of fields accepted when persisting a freshly-calculated commission. */
export type ICreateCommissionInput = Omit<ICommission, "id" | "createdAt">;

export interface ICloseMonthlyPeriodInput {
  storeId: ID;
  period: string;
  approvedBy: ID;
}

export interface IOpenDisputeInput {
  commissionId: ID;
  reason: string;
  actorId: ID;
}

export interface IResolveDisputeInput {
  commissionId: ID;
  resolution: string;
  actorId: ID;
  /** Final status after resolution (`approved` keeps original, `canceled` voids). */
  finalStatus: Extract<CommissionStatus, "approved" | "canceled">;
}

export interface IRegisterPaymentInput {
  commissionId: ID;
  paidBy: ID;
  paidAt?: string;
}

/**
 * Contract for seller commissions access (PRD-047).
 *
 * @see ../../../mocks/api/commissions.ts
 * @see ../../../../docs/provider-pattern.md
 */
export interface ICommissionsProvider {
  list(params?: IListCommissionsParams): Promise<IPaginatedResult<ICommission>>;
  create(input: ICreateCommissionInput): Promise<ICommission>;
  update(id: ID, patch: Partial<ICommission>): Promise<ICommission>;
  closeMonthlyPeriod(input: ICloseMonthlyPeriodInput): Promise<ICommission[]>;
  openDispute(input: IOpenDisputeInput): Promise<ICommission>;
  resolveDispute(input: IResolveDisputeInput): Promise<ICommission>;
  registerPayment(input: IRegisterPaymentInput): Promise<ICommission>;
}
