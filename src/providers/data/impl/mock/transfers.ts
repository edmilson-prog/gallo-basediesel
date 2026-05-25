import { transfersApi } from "@/mocks";
import type { ITransfersProvider } from "../../contracts/transfers";
import { scopedListParams } from "./_storeScope";

export const mockTransfersProvider: ITransfersProvider = {
  list: (params) => transfersApi.list(scopedListParams(params, "transfer")),
};
