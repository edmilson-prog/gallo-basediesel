import { containsCommercialValue } from "./guardrails.ts";
import type { ISdrLlmDecision } from "./llmDecision.ts";

const SAFE_FALLBACK_REPLY =
  "Isso já é uma decisão comercial — vou te conectar com um vendedor pra fechar certinho com você.";

/**
 * The last line of defense: even if the model was told never to mention
 * price/discount/shipping/deadlines, it might anyway (hallucination, or a
 * customer trying to bait it into a number). If the generated reply text
 * trips the commercial-value scan, the decision is discarded wholesale and
 * replaced with a safe handoff — the model's intent (continue/answer_faq/
 * whatever it picked) is never trusted once this fires.
 */
export function enforceSdrGuardrails(decision: ISdrLlmDecision): ISdrLlmDecision {
  if (!containsCommercialValue(decision.reply)) {
    return decision;
  }
  return {
    reply: SAFE_FALLBACK_REPLY,
    action: "handoff",
    handoffReason: "out_of_scope",
    ...(decision.collectedData ? { collectedData: decision.collectedData } : {}),
  };
}
