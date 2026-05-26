import type { ID, IPart, IPartIdentification, PartIdentificationStatus } from "@/shared/types";
import { extractAttributes, type IExtractContext } from "./extract";
import { searchCatalogWithFallback } from "./search";
import { decideAction } from "./decide";

export interface IIdentifyPartInput {
  rawInput: string;
  conversationId: ID;
  sessionId?: ID;
  context?: IExtractContext;
  parts: IPart[];
  now?: string;
}

export interface IIdentifyPartResult {
  identification: IPartIdentification;
  reusedFromVehicle: boolean;
  multipleVehiclesAmbiguous: boolean;
  usedFallbackCatalog: boolean;
}

/**
 * Single orchestrator that walks the identification pipeline: extract →
 * search → decide. Pure (no side effects) — callers are responsible for
 * persistence and audit logging.
 *
 * @see ../../../docs/prds/PRD-021-identificacao-peca.md
 */
export function identifyPart(input: IIdentifyPartInput): IIdentifyPartResult {
  const now = input.now ?? new Date().toISOString();
  const extracted = extractAttributes(input.rawInput, input.context);
  const search = searchCatalogWithFallback(extracted.attributes, input.parts);
  const decision = decideAction(
    search.candidates,
    extracted.attributes,
    extracted.attributeConfidence,
  );

  const status: PartIdentificationStatus =
    decision.kind === "confirm_auto"
      ? "awaiting_confirmation"
      : decision.kind === "ask_user"
        ? "awaiting_confirmation"
        : "awaiting_confirmation";

  const identification: IPartIdentification = {
    id: `partid-${input.conversationId}-${Date.now()}`,
    conversationId: input.conversationId,
    sessionId: input.sessionId,
    rawInput: input.rawInput,
    extractedAttributes: extracted.attributes,
    attributeConfidence: extracted.attributeConfidence,
    confidence: extracted.confidence,
    candidates: search.candidates,
    decision,
    status,
    createdAt: now,
  };

  return {
    identification,
    reusedFromVehicle: extracted.reusedFromVehicle,
    multipleVehiclesAmbiguous: extracted.multipleVehiclesAmbiguous,
    usedFallbackCatalog: search.usedFallback,
  };
}

/**
 * Apply a customer's choice to a pending identification, mutating its status
 * to `confirmed` / `rejected` / `failed` based on the chosen index.
 *
 * Pure — returns a new object instead of mutating the input.
 */
export function applyCustomerChoice(
  identification: IPartIdentification,
  choiceIndex: number | null,
  now: string,
): IPartIdentification {
  if (choiceIndex === null) {
    return {
      ...identification,
      status: "failed",
      resolvedAt: now,
    };
  }
  const chosen = identification.candidates[choiceIndex];
  if (!chosen) {
    return {
      ...identification,
      status: "rejected",
      resolvedAt: now,
    };
  }
  return {
    ...identification,
    status: "confirmed",
    customerConfirmedPartId: chosen.partId,
    resolvedAt: now,
  };
}
