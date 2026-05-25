import type { IPositivation, ID } from "@/shared/types";
import { selectAllPositivations } from "../store/selectors";
import { MockNotFoundError, runApi } from "./utils";

export const positivationsApi = {
  list(params: { storeId?: ID; period?: string } = {}): Promise<IPositivation[]> {
    return runApi(
      "positivationsApi",
      "list",
      () => {
        let all = selectAllPositivations();
        if (params.storeId) all = all.filter((p) => p.storeId === params.storeId);
        if (params.period) all = all.filter((p) => p.period === params.period);
        return [...all];
      },
      { payload: params },
    );
  },

  async getCurrent(storeId: ID): Promise<IPositivation> {
    return runApi("positivationsApi", "getCurrent", () => {
      const found = selectAllPositivations().find((p) => p.storeId === storeId);
      if (!found) throw new MockNotFoundError("positivation", storeId);
      return found;
    });
  },
};
