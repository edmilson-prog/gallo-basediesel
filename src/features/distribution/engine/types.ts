import type {
  DistributionMatchedCriterion,
  DistributionMode,
  ID,
  IConversation,
  ICustomer,
  IDistributionCandidate,
  IDistributionSettings,
  ILead,
  ISeller,
  ISO8601,
} from "@/shared/types";

/**
 * Input describing the incoming conversation. Customer / lead are mutually
 * exclusive — the engine asserts the invariant before evaluating critéria.
 */
export interface IDistributionInput {
  /** Conversation id (already minted) so the trace can reference it. */
  conversationId: ID;
  storeId: ID;
  channel: IConversation["channel"];
  /** Resolved entity behind the conversation (one and only one is set). */
  participant: { kind: "customer"; customer: ICustomer } | { kind: "lead"; lead: ILead };
  /** First message text — used by the especialidade keyword matcher. */
  firstMessageText: string;
  /** Wall clock at which the message arrived. */
  occurredAt: ISO8601;
}

/**
 * Read-only world the engine inspects to make a decision. Built by the caller
 * from the provider layer; the engine itself NEVER queries providers — that's
 * what keeps it pure.
 */
export interface IDistributionContext {
  settings: IDistributionSettings;
  /** All sellers in scope (already filtered to the relevant storeId). */
  sellers: ISeller[];
  /** Open-conversation count per seller, used by the carga criterion. */
  loadBySeller: Record<ID, number>;
  /** Specialties keyword -> seller ids. Optional — the engine derives if absent. */
  specialtiesBySeller?: Record<ID, string[]>;
}

/** Outcome returned by each `try*` criterion. */
export interface ICriterionOutcome {
  matched: boolean;
  selectedSellerId?: ID | null;
  /**
   * Free-form notes one per candidate evaluated by this criterion (added to
   * `candidatesEvaluated` of the trace).
   */
  candidates: IDistributionCandidate[];
  /** When matched, the criterion identifier as it appears in the trace. */
  matchedAs?: DistributionMatchedCriterion;
}

/** Final decision returned by `distributeConversation`. */
export interface IDistributionResult {
  selectedSellerId: ID | null;
  isSdrActive: boolean;
  status: IConversation["status"];
  criterionMatched: DistributionMatchedCriterion;
  candidatesEvaluated: IDistributionCandidate[];
  /**
   * When set, the engine emitted a system-bubble message that callers should
   * persist alongside the conversation (e.g. the off-hours welcome).
   */
  systemMessage?: string;
  /** Captured mode at decision time (replay safety). */
  mode: DistributionMode;
}
