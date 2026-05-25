import type { IABCClassification, ID } from "@/shared/types";
import { selectAllAbcs } from "../store/selectors";
import { runApi } from "./utils";

export const abcsApi = {
  list(
    params: {
      customerId?: ID;
      storeId?: ID;
      period?: string;
      class?: IABCClassification["class"];
    } = {},
  ): Promise<IABCClassification[]> {
    return runApi(
      "abcsApi",
      "list",
      () => {
        let all = selectAllAbcs();
        if (params.customerId) all = all.filter((a) => a.customerId === params.customerId);
        if (params.storeId) all = all.filter((a) => a.storeId === params.storeId);
        if (params.period) all = all.filter((a) => a.period === params.period);
        if (params.class) all = all.filter((a) => a.class === params.class);
        return [...all].sort((a, b) => b.revenueShare - a.revenueShare);
      },
      { payload: params },
    );
  },
};
