import type { ICommission, ID } from "@/shared/types";
import { selectAllCommissions } from "../store/selectors";
import { patchById } from "../store/mutations";
import {
  MockNotFoundError,
  paginate,
  runApi,
  type IPaginatedResult,
  type IPaginationParams,
} from "./utils";

export interface IListCommissionsParams extends IPaginationParams {
  storeId?: ID;
  sellerId?: ID;
  status?: ICommission["status"];
  period?: string;
}

export const commissionsApi = {
  list(params: IListCommissionsParams = {}): Promise<IPaginatedResult<ICommission>> {
    return runApi(
      "commissionsApi",
      "list",
      () => {
        let all = selectAllCommissions();
        if (params.storeId) all = all.filter((c) => c.storeId === params.storeId);
        if (params.sellerId) all = all.filter((c) => c.sellerId === params.sellerId);
        if (params.status) all = all.filter((c) => c.status === params.status);
        if (params.period) all = all.filter((c) => c.period === params.period);
        const sorted = [...all].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        return paginate(sorted, params);
      },
      { payload: params },
    );
  },

  async update(id: ID, patch: Partial<ICommission>): Promise<ICommission> {
    return runApi("commissionsApi", "update", () => {
      const updated = patchById("commissions", id, patch);
      if (!updated) throw new MockNotFoundError("commission", id);
      return updated;
    });
  },
};
