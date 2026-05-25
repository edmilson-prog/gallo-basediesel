import { goalsApi } from "@/mocks";
import type { IGoalsProvider } from "../../contracts/goals";

export const mockGoalsProvider: IGoalsProvider = {
  list: (params) => goalsApi.list(params),
  upsert: (goal) => goalsApi.upsert(goal),
  update: (id, patch) => goalsApi.update(id, patch),
};
