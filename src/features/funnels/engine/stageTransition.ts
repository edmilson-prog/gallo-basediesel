import type { ID, ILeadFunnelEntry, ILeadFunnelStage } from "@/shared/types";
import { isClosingKind } from "./stageKind";

export type TransitionPlan =
  | { action: "move"; entryId: ID; stageId: ID; clearOutcome: boolean }
  | { action: "require_conversion"; entryId: ID; stageId: ID; linkToCustomerId?: ID }
  | { action: "require_loss_reason"; entryId: ID; stageId: ID }
  | { action: "noop"; reason: "same_stage" }
  | { action: "error"; reason: "stage_from_another_funnel" };

export interface ITransitionInput {
  entry: ILeadFunnelEntry;
  target: ILeadFunnelStage;
  /** The lead's OTHER memberships — needed to avoid a duplicate customer. */
  siblingEntries: ILeadFunnelEntry[];
}

/**
 * Decides what a stage change means for one membership. Never touches the
 * lead's other funnels: dropping a card in Catalisador leaves Filtros alone.
 */
export function planStageTransition(input: ITransitionInput): TransitionPlan {
  const { entry, target } = input;

  if (target.funnelId !== entry.funnelId) {
    return { action: "error", reason: "stage_from_another_funnel" };
  }
  if (target.id === entry.stageId) {
    return { action: "noop", reason: "same_stage" };
  }

  if (target.kind === "ganho") {
    // If any other membership of this lead already produced a customer, the
    // second conversion must LINK to it. Offering "create new" here is how the
    // same person ends up with two customer records.
    const alreadyConverted = input.siblingEntries.find((e) => e.convertedToCustomerId);
    return {
      action: "require_conversion",
      entryId: entry.id,
      stageId: target.id,
      linkToCustomerId: alreadyConverted?.convertedToCustomerId,
    };
  }

  if (target.kind === "perda") {
    return { action: "require_loss_reason", entryId: entry.id, stageId: target.id };
  }

  // Moving back into an open stage reopens the membership.
  const wasClosed = Boolean(entry.convertedToCustomerId) || Boolean(entry.lossReason);
  return {
    action: "move",
    entryId: entry.id,
    stageId: target.id,
    clearOutcome: wasClosed && !isClosingKind(target.kind),
  };
}
