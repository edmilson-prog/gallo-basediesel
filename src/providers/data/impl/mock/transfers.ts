import { transfersApi } from "@/mocks";
import type { ITransfersProvider } from "../../contracts/transfers";

export const mockTransfersProvider: ITransfersProvider = {
  list: (params) => transfersApi.list(params),
};
