import type { ID, IGoal } from "@/shared/types";
import { selectAllGoals } from "../store/selectors";
import { patchById, upsert } from "../store/mutations";
import {
  MockNotFoundError,
  paginate,
  runApi,
  type IPaginatedResult,
  type IPaginationParams,
} from "./utils";

export interface IListGoalsParams extends IPaginationParams {
  storeId?: ID;
  level?: IGoal["level"];
  targetId?: ID;
  metric?: IGoal["metric"];
}

export const goalsApi = {
  list(params: IListGoalsParams = {}): Promise<IPaginatedResult<IGoal>> {
    return runApi(
      "goalsApi",
      "list",
      () => {
        let all = selectAllGoals();
        if (params.storeId) all = all.filter((g) => g.storeId === params.storeId);
        if (params.level) all = all.filter((g) => g.level === params.level);
        if (params.targetId) all = all.filter((g) => g.targetId === params.targetId);
        if (params.metric) all = all.filter((g) => g.metric === params.metric);
        const sorted = [...all].sort((a, b) => b.period.end.localeCompare(a.period.end));
        return paginate(sorted, params);
      },
      { payload: params },
    );
  },

  async upsert(goal: IGoal): Promise<IGoal> {
    return runApi("goalsApi", "upsert", () =>
      upsert("goals", { ...goal, updatedAt: new Date().toISOString() }),
    );
  },

  async update(id: ID, patch: Partial<IGoal>): Promise<IGoal> {
    return runApi("goalsApi", "update", () => {
      const updated = patchById("goals", id, { ...patch, updatedAt: new Date().toISOString() });
      if (!updated) throw new MockNotFoundError("goal", id);
      return updated;
    });
  },
};
