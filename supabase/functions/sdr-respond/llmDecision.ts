/**
 * Structured contract the LLM must answer in (enforced by the system prompt
 * built in systemPrompt.ts). The model never decides anything by free text —
 * it picks one of a closed set of actions, and even then enforceGuardrails.ts
 * overrides it if the reply text violates a hard rule. This keeps the model
 * as a language generator, not a decision-maker.
 */
export type SdrLlmAction = "continue" | "answer_faq" | "handoff" | "close";

/** Mirrors SdrEscalationReason (src/shared/types/sdr-escalation.ts) exactly. */
export type SdrHandoffReason =
  | "customer_requested"
  | "negotiation_detected"
  | "sdr_failed"
  | "complexity"
  | "out_of_scope"
  | "qualified_handoff";

export interface ISdrLlmCollectedData {
  preferredName?: string;
  location?: string;
  needSummary?: string;
}

export interface ISdrLlmDecision {
  reply: string;
  action: SdrLlmAction;
  collectedData?: ISdrLlmCollectedData;
  handoffReason?: SdrHandoffReason;
}

const VALID_ACTIONS = new Set<SdrLlmAction>(["continue", "answer_faq", "handoff", "close"]);

const VALID_HANDOFF_REASONS = new Set<SdrHandoffReason>([
  "customer_requested",
  "negotiation_detected",
  "sdr_failed",
  "complexity",
  "out_of_scope",
  "qualified_handoff",
]);

function parseCollectedData(value: unknown): ISdrLlmCollectedData | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "object" || value === null) return null;
  const obj = value as Record<string, unknown>;
  const result: ISdrLlmCollectedData = {};
  for (const key of ["preferredName", "location", "needSummary"] as const) {
    if (obj[key] === undefined) continue;
    if (typeof obj[key] !== "string") return null;
    result[key] = obj[key] as string;
  }
  return result;
}

export function parseSdrLlmDecision(raw: string): ISdrLlmDecision | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;

  if (typeof obj.reply !== "string") return null;
  if (typeof obj.action !== "string" || !VALID_ACTIONS.has(obj.action as SdrLlmAction)) return null;
  const action = obj.action as SdrLlmAction;

  if (action === "handoff") {
    if (
      typeof obj.handoffReason !== "string" ||
      !VALID_HANDOFF_REASONS.has(obj.handoffReason as SdrHandoffReason)
    ) {
      return null;
    }
  }

  const collectedData = parseCollectedData(obj.collectedData);
  if (collectedData === null) return null;

  return {
    reply: obj.reply,
    action,
    ...(collectedData !== undefined ? { collectedData } : {}),
    ...(action === "handoff" ? { handoffReason: obj.handoffReason as SdrHandoffReason } : {}),
  };
}
