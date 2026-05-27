import type { GoalLevel, GoalMetric, GoalPeriodType, ID, IGoal } from "@/shared/types";
import { GOALS_STRINGS as S } from "../i18n/pt-BR";

export interface IGoalDraft {
  metric: GoalMetric;
  level: GoalLevel;
  periodType: GoalPeriodType;
  startDate: string;
  endDate: string;
  storeId: ID;
  sellerId?: ID;
  targetValue: number;
  name: string;
  rewardDescription?: string;
}

export function validateGoalDraft(
  draft: IGoalDraft,
  ctx: { existingGoals: IGoal[]; sellersById: Map<ID, string> },
): string[] {
  const errors: string[] = [];

  if (new Date(draft.endDate) <= new Date(draft.startDate)) {
    errors.push(S.validationEndBeforeStart);
  }
  if (!Number.isFinite(draft.targetValue) || draft.targetValue <= 0) {
    errors.push(S.validationTargetPositive);
  }
  if (draft.level === "individual" && !draft.sellerId) {
    errors.push(S.validationSellerRequired);
  }
  if (!draft.storeId) {
    errors.push(S.validationStoreRequired);
  }

  const duplicate = findDuplicateGoal(draft, ctx.existingGoals);
  if (duplicate) {
    const periodLabel = `${new Date(draft.startDate).toLocaleDateString("pt-BR", {
      month: "long",
      year: "numeric",
    })}`;
    const sellerName =
      draft.level === "individual"
        ? (ctx.sellersById.get(draft.sellerId ?? "") ?? "vendedor")
        : "a loja";
    errors.push(S.validationDuplicate(sellerName, periodLabel));
  }

  return errors;
}

function findDuplicateGoal(draft: IGoalDraft, goals: IGoal[]): IGoal | undefined {
  return goals.find((g) => {
    if ((g.status ?? "ativa") !== "ativa") return false;
    if (g.metric !== draft.metric) return false;
    if (g.level !== draft.level) return false;
    if (g.storeId !== draft.storeId) return false;
    if (draft.level === "individual" && g.targetId !== draft.sellerId) return false;
    if (g.period.type !== draft.periodType) return false;
    const overlapStart = new Date(draft.startDate) <= new Date(g.period.end);
    const overlapEnd = new Date(draft.endDate) >= new Date(g.period.start);
    return overlapStart && overlapEnd;
  });
}

/** Auto-fill start/end based on the chosen period type. */
export function defaultPeriodRange(
  periodType: GoalPeriodType,
  reference: Date = new Date(),
): { start: string; end: string } {
  if (periodType === "daily") {
    const s = new Date(reference);
    s.setHours(0, 0, 0, 0);
    const e = new Date(s);
    e.setHours(23, 59, 59, 999);
    return { start: s.toISOString().slice(0, 10), end: e.toISOString().slice(0, 10) };
  }
  if (periodType === "quarterly") {
    const month = reference.getMonth();
    const quarterStart = Math.floor(month / 3) * 3;
    const s = new Date(reference.getFullYear(), quarterStart, 1);
    const e = new Date(reference.getFullYear(), quarterStart + 3, 0);
    return { start: s.toISOString().slice(0, 10), end: e.toISOString().slice(0, 10) };
  }
  // monthly default
  const s = new Date(reference.getFullYear(), reference.getMonth(), 1);
  const e = new Date(reference.getFullYear(), reference.getMonth() + 1, 0);
  return { start: s.toISOString().slice(0, 10), end: e.toISOString().slice(0, 10) };
}
