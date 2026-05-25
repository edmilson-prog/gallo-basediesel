import type { IRanking, ID } from "@/shared/types";
import { selectAllRankings } from "../store/selectors";
import { MockNotFoundError, runApi } from "./utils";

export const rankingsApi = {
  list(params: { storeId?: ID; period?: string } = {}): Promise<IRanking[]> {
    return runApi(
      "rankingsApi",
      "list",
      () => {
        let all = selectAllRankings();
        if (params.storeId) all = all.filter((r) => r.storeId === params.storeId);
        if (params.period) all = all.filter((r) => r.period === params.period);
        return [...all].sort((a, b) => b.period.localeCompare(a.period));
      },
      { payload: params },
    );
  },

  async getCurrent(storeId: ID): Promise<IRanking> {
    return runApi("rankingsApi", "getCurrent", () => {
      const ranking = selectAllRankings().find((r) => r.storeId === storeId);
      if (!ranking) throw new MockNotFoundError("ranking", storeId);
      return ranking;
    });
  },
};
