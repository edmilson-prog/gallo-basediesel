import type { ID, IServiceKit } from "@/shared/types";
import { SEED_SERVICE_KITS } from "../data/seedServiceKits";
import { runApi } from "./utils";

export interface IListServiceKitsParams {
  storeId?: ID;
}

export const serviceKitsApi = {
  list(params: IListServiceKitsParams = {}): Promise<IServiceKit[]> {
    return runApi(
      "serviceKitsApi",
      "list",
      () => {
        let all = SEED_SERVICE_KITS;
        if (params.storeId) all = all.filter((k) => k.storeId === params.storeId);
        return all;
      },
      { payload: params },
    );
  },
};
