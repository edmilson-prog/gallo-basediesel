import type { ID, ILeadFunnelEntry, ILeadFunnelStage } from "@/shared/types";
import { isClosingKind } from "./stageKind";

export type TransitionPlan =
  | { action: "move"; entryId: ID; stageId: ID; clearOutcome: boolean }
  | {
      action: "require_conversion";
      entryId: ID;
      stageId: ID;
      linkToCustomerId?: ID;
      /**
       * The entry was previously lost (lossReason/lossNotes set). Named for
       * the SPECIFIC outcome to clear — not a generic `clearOutcome: boolean`
       * — so the UI, once written, cannot execute this plan while forgetting
       * which fields it refers to: `clearLossOutcome` only ever means "wipe
       * lossReason/lossNotes", never "wipe convertedToCustomerId". Every
       * "is lost" predicate in the codebase keys off `lossReason !== undefined`
       * (isClosedLead, the Supabase leads provider's excludeLost filter, the
       * backfill's `loss_reason is not null`), so leaving it set on a WON
       * membership makes a converted opportunity read as lost.
       */
      clearLossOutcome: boolean;
    }
  | {
      action: "require_loss_reason";
      entryId: ID;
      stageId: ID;
      /**
       * The entry was previously converted (convertedToCustomerId set). Mirror
       * of `clearLossOutcome` above, scoped to the opposite field for the same
       * reason: a name that states exactly what it clears, so a caller can't
       * apply it to the wrong outcome by mistake.
       */
      clearWonOutcome: boolean;
    }
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
      // Dragging a lost entry (Perdido) straight onto a won stage must wipe
      // the old loss outcome, or the membership ends up with BOTH
      // convertedToCustomerId AND lossReason set — see TransitionPlan above.
      clearLossOutcome: Boolean(entry.lossReason) || Boolean(entry.lossNotes),
    };
  }

  if (target.kind === "perda") {
    return {
      action: "require_loss_reason",
      entryId: entry.id,
      stageId: target.id,
      // Mirror case: a converted entry (Convertido) dragged onto Perdido must
      // wipe the old won outcome, or the membership ends up with BOTH
      // convertedToCustomerId AND lossReason set.
      clearWonOutcome: Boolean(entry.convertedToCustomerId),
    };
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
