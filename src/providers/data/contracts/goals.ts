import type { ID, IGoal } from "@/shared/types";
import type { IPaginatedResult, IPaginationParams } from "./_shared";

export interface IListGoalsParams extends IPaginationParams {
  storeId?: ID;
  level?: IGoal["level"];
  targetId?: ID;
  metric?: IGoal["metric"];
}

/**
 * Contract for sales goals access (loja / equipe / vendedor).
 *
 * @see ../../../mocks/api/goals.ts
 * @see ../../../../docs/provider-pattern.md
 */
export interface IGoalsProvider {
  list(params?: IListGoalsParams): Promise<IPaginatedResult<IGoal>>;
  upsert(goal: IGoal): Promise<IGoal>;
  update(id: ID, patch: Partial<IGoal>): Promise<IGoal>;
}
