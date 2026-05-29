import type { CashFlowDirection, ICashFlowEntry, ID } from "@/shared/types";
import { selectAllCashFlowEntries } from "../store/selectors";
import { upsert } from "../store/mutations";
import { runApi, type IPaginatedResult, type IPaginationParams } from "./utils";

export interface IListCashFlowEntriesParams extends IPaginationParams {
  storeId?: ID;
  /** Inclusive date window (ISO) on the entry `date`. */
  start?: string;
  end?: string;
}

export interface ICreateCashFlowEntryInput {
  type: CashFlowDirection;
  /** `aporte` (entrada) or `retirada` (saida). */
  amount: number;
  date: string;
  description: string;
  storeId: ID;
  createdBy: ID;
}

let createdSeq = 0;
function nextId(): ID {
  createdSeq += 1;
  return `cf-rt-${String(Date.now()).slice(-6)}-${createdSeq}`;
}

export const cashflowApi = {
  /** List the persisted MANUAL entries (aporte/retirada). Derived entries are computed in the engine. */
  list(params: IListCashFlowEntriesParams = {}): Promise<IPaginatedResult<ICashFlowEntry>> {
    return runApi(
      "cashflowApi",
      "list",
      () => {
        let all = selectAllCashFlowEntries();
        if (params.storeId) all = all.filter((e) => e.storeId === params.storeId);
        if (params.start) all = all.filter((e) => e.date >= (params.start as string));
        if (params.end) all = all.filter((e) => e.date <= (params.end as string));
        const sorted = [...all].sort((a, b) => b.date.localeCompare(a.date));
        const total = sorted.length;
        const page = Math.max(1, Math.floor(params.page ?? 1));
        const pageSize = Math.max(1, Math.floor(params.pageSize ?? 1000));
        return {
          data: sorted.slice((page - 1) * pageSize, page * pageSize),
          total,
          page,
          pageSize,
        };
      },
      { payload: params },
    );
  },

  create(input: ICreateCashFlowEntryInput): Promise<ICashFlowEntry> {
    return runApi("cashflowApi", "create", () => {
      const now = new Date().toISOString();
      const entry: ICashFlowEntry = {
        id: nextId(),
        type: input.type,
        source: input.type === "entrada" ? "aporte" : "retirada",
        description: input.description,
        amount: Math.abs(input.amount),
        date: input.date,
        status: "realizado",
        storeId: input.storeId,
        createdBy: input.createdBy,
        createdAt: now,
      };
      upsert("cashFlowEntries", entry);
      return entry;
    });
  },
};
