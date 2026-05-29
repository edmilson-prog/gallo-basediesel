import { cashflowApi } from "@/mocks";
import type { ICashFlowProvider } from "../../contracts/cashflow";
import { logMockMutation } from "./_audit";
import { scopedListParams, withCreateStoreId } from "./_storeScope";

export const mockCashFlowProvider: ICashFlowProvider = {
  list: (params) => cashflowApi.list(scopedListParams(params, "cashflow")),
  create: async (input) => {
    const created = await cashflowApi.create(withCreateStoreId(input));
    logMockMutation({
      action: "cashflow_manual_entry",
      resource: "cashflow",
      resourceId: created.id,
      after: { type: created.type, source: created.source, amount: created.amount },
      storeId: created.storeId,
    });
    return created;
  },
};
