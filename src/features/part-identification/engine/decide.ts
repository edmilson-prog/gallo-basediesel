import type {
  AttributeConfidence,
  IExtractedAttributes,
  IPartCandidate,
  IPartIdentificationDecision,
} from "@/shared/types";

/**
 * Pick the next action the agent should take given the search outcome.
 *
 * Strategies (RF-014):
 *  - `confirm_auto` — single dominant candidate (score > 0.9).
 *  - `ask_user` — 2-3 candidates with score > 0.6.
 *  - `request_more_info` — too few candidates OR top score < 0.6.
 *
 * The missing attribute list (when applicable) drives the
 * `formatConfirmationMessage()` template.
 */
export function decideAction(
  candidates: IPartCandidate[],
  attributes: IExtractedAttributes,
  attributeConfidence: AttributeConfidence,
): IPartIdentificationDecision {
  const ranked = [...candidates].sort((a, b) => b.score - a.score);
  const top = ranked[0];

  if (top && ranked.length === 1 && top.score > 0.9) {
    return { kind: "confirm_auto", reason: "Candidato dominante com score > 0.9." };
  }

  const strongCount = ranked.filter((c) => c.score >= 0.6).length;
  if (top && strongCount >= 2) {
    return {
      kind: "ask_user",
      reason: `Encontrados ${strongCount} candidatos com score >= 0.6 — apresentando ao cliente.`,
    };
  }

  if (top && top.score > 0.9) {
    return { kind: "confirm_auto", reason: "Top candidato com score > 0.9." };
  }

  const missing = listMissingAttributes(attributes, attributeConfidence);
  return {
    kind: "request_more_info",
    reason:
      top && top.score >= 0.6
        ? "Top candidato com score moderado — pedindo refinamento."
        : "Nenhum candidato suficientemente forte — pedindo mais informações.",
    missingAttributes: missing,
  };
}

function listMissingAttributes(
  attributes: IExtractedAttributes,
  confidence: AttributeConfidence,
): Array<keyof IExtractedAttributes> {
  const missing: Array<keyof IExtractedAttributes> = [];
  if (!attributes.brand || (confidence.brand ?? 0) < 0.5) missing.push("brand");
  if (!attributes.model || (confidence.model ?? 0) < 0.5) missing.push("model");
  if (!attributes.partCategory) missing.push("partCategory");
  if (attributes.partCategory && !attributes.partSubtype) missing.push("partSubtype");
  return missing;
}
