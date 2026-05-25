import type { ICarteiraTransfer, ID } from "@/shared/types";
import { selectAllTransfers } from "../store/selectors";
import { paginate, runApi, type IPaginatedResult, type IPaginationParams } from "./utils";

export interface IListTransfersParams extends IPaginationParams {
  storeId?: ID;
  fromSellerId?: ID;
  toSellerId?: ID;
  status?: ICarteiraTransfer["status"];
}

export const transfersApi = {
  list(params: IListTransfersParams = {}): Promise<IPaginatedResult<ICarteiraTransfer>> {
    return runApi(
      "transfersApi",
      "list",
      () => {
        let all = selectAllTransfers();
        if (params.storeId) all = all.filter((t) => t.storeId === params.storeId);
        if (params.fromSellerId) all = all.filter((t) => t.fromSellerId === params.fromSellerId);
        if (params.toSellerId) all = all.filter((t) => t.toSellerId === params.toSellerId);
        if (params.status) all = all.filter((t) => t.status === params.status);
        const sorted = [...all].sort((a, b) => b.startDate.localeCompare(a.startDate));
        return paginate(sorted, params);
      },
      { payload: params },
    );
  },
};
