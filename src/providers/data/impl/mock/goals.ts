import { goalsApi } from "@/mocks";
import type { IGoalsProvider } from "../../contracts/goals";
import { scopedListParams } from "./_storeScope";

export const mockGoalsProvider: IGoalsProvider = {
  list: (params) => goalsApi.list(scopedListParams(params, "goal")),
  upsert: (goal) => goalsApi.upsert(goal),
  update: (id, patch) => goalsApi.update(id, patch),
};
