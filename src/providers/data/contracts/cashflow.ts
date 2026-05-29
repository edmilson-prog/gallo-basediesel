import type { ICashFlowEntry } from "@/shared/types";
import type { ICreateCashFlowEntryInput, IListCashFlowEntriesParams } from "@/mocks/api/cashflow";
import type { IPaginatedResult } from "./_shared";

export type { ICreateCashFlowEntryInput, IListCashFlowEntriesParams } from "@/mocks/api/cashflow";

/**
 * Contract for cash flow manual entries (PRD-055). Only manual aporte/retirada
 * entries are persisted; derived movements are computed by the engine.
 *
 * @see ../../../mocks/api/cashflow.ts
 */
export interface ICashFlowProvider {
  list(params?: IListCashFlowEntriesParams): Promise<IPaginatedResult<ICashFlowEntry>>;
  create(input: ICreateCashFlowEntryInput): Promise<ICashFlowEntry>;
}
