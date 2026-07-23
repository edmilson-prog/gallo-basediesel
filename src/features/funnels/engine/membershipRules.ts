import type { ID, ILeadFunnel, ILeadFunnelEntry, ILeadFunnelStage, Money } from "@/shared/types";

export type AddPlan =
  | { action: "create"; funnelId: ID; stageId: ID; estimatedValue?: Money }
  | { action: "noop"; reason: "already_member" }
  | { action: "error"; reason: "no_entry_stage" }
  | { action: "error"; reason: "invalid_stage" };

export type RemovePlan =
  | {
      action: "remove";
      entryId: ID;
      movedToDefault: boolean;
      recreateInFunnelId?: ID;
      recreateInStageId?: ID;
    }
  | { action: "noop"; reason: "not_a_member" }
  | { action: "error"; reason: "cannot_leave_default_alone" };

export interface IAddInput {
  existing: ILeadFunnelEntry[];
  funnel: ILeadFunnel;
  stages: ILeadFunnelStage[];
  leadEstimatedValue: Money | undefined;
  /** Explicit target stage; defaults to the funnel's entry stage. */
  stageId?: ID;
}

export function planAddToFunnel(input: IAddInput): AddPlan {
  if (input.existing.some((e) => e.funnelId === input.funnel.id)) {
    return { action: "noop", reason: "already_member" };
  }

  // An explicit stageId is a caller request, not a hint — if it doesn't
  // resolve to a real stage, that must surface as an error, never silently
  // fall back to the entry stage.
  if (input.stageId !== undefined) {
    const target = input.stages.find((s) => s.id === input.stageId);
    if (!target) return { action: "error", reason: "invalid_stage" };

    return {
      action: "create",
      funnelId: input.funnel.id,
      stageId: target.id,
      estimatedValue: input.leadEstimatedValue,
    };
  }

  const entryStage = input.stages.find((s) => s.kind === "entrada");
  if (!entryStage) return { action: "error", reason: "no_entry_stage" };

  return {
    action: "create",
    funnelId: input.funnel.id,
    stageId: entryStage.id,
    estimatedValue: input.leadEstimatedValue,
  };
}

export interface IRemoveInput {
  existing: ILeadFunnelEntry[];
  entryId: ID;
  defaultFunnel: ILeadFunnel;
  defaultFunnelStages: ILeadFunnelStage[];
}

/**
 * A lead must never end up with zero memberships — it would disappear from every
 * board and list with no trace. Removing the last one re-adds it to the default
 * funnel instead.
 */
export function planRemoveFromFunnel(input: IRemoveInput): RemovePlan {
  const target = input.existing.find((e) => e.id === input.entryId);
  if (!target) return { action: "noop", reason: "not_a_member" };

  const remaining = input.existing.filter((e) => e.id !== input.entryId);
  if (remaining.length > 0) {
    return { action: "remove", entryId: input.entryId, movedToDefault: false };
  }

  // Removing the last membership when it already IS the default funnel would
  // loop: there is nowhere further to fall back to.
  if (target.funnelId === input.defaultFunnel.id) {
    return { action: "error", reason: "cannot_leave_default_alone" };
  }

  const entryStage = input.defaultFunnelStages.find((s) => s.kind === "entrada");
  if (!entryStage) return { action: "error", reason: "cannot_leave_default_alone" };

  return {
    action: "remove",
    entryId: input.entryId,
    movedToDefault: true,
    recreateInFunnelId: input.defaultFunnel.id,
    recreateInStageId: entryStage.id,
  };
}
