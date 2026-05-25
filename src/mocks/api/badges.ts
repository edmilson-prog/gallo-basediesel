import type { IGamificationBadge, ID } from "@/shared/types";
import { selectAllBadges } from "../store/selectors";
import { runApi } from "./utils";

export const badgesApi = {
  list(params: { sellerId?: ID; periodRef?: string } = {}): Promise<IGamificationBadge[]> {
    return runApi("badgesApi", "list", () => {
      let all = selectAllBadges();
      if (params.sellerId) all = all.filter((b) => b.sellerId === params.sellerId);
      if (params.periodRef) all = all.filter((b) => b.periodRef === params.periodRef);
      return [...all].sort((a, b) => b.earnedAt.localeCompare(a.earnedAt));
    });
  },
};
