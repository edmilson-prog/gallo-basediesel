import { transfersApi } from "@/mocks";
import type { ITransfersProvider } from "../../contracts/transfers";
import { logMockMutation } from "./_audit";
import { scopedListParams } from "./_storeScope";

export const mockTransfersProvider: ITransfersProvider = {
  list: (params) => transfersApi.list(scopedListParams(params, "transfer")),
  create: async (input) => {
    const created = await transfersApi.create(input);
    logMockMutation({
      action: "create",
      resource: "transfer",
      resourceId: created.id,
      after: created,
      storeId: created.storeId,
    });
    return created;
  },
};
