import type { ID, ISO8601, Money } from "./common";

/**
 * Lifecycle state of a single attempt to identify a part out of a customer
 * utterance (text or photo placeholder). Owned by the part-identification
 * feature (PRD-021); referenced from `ISdrCollectedData.identifiedPart`.
 *
 * @see ../../../docs/prds/PRD-021-identificacao-peca.md
 */
export type PartIdentificationStatus =
  | "extracting"
  | "searching"
  | "awaiting_confirmation"
  | "confirmed"
  | "rejected"
  | "failed";

/** Coarse taxonomy of part families covered by the keyword-based extractor. */
export type PartCategory =
  | "filtro"
  | "freio"
  | "correia"
  | "motor"
  | "embreagem"
  | "eletrica"
  | "transmissao"
  | "suspensao"
  | "arrefecimento"
  | "lubrificante";

/** Attributes extracted from the customer utterance — every field is optional. */
export interface IExtractedAttributes {
  brand?: string;
  model?: string;
  year?: number;
  engine?: string;
  partCategory?: PartCategory;
  /** Sub-category within a category (e.g. `oleo` / `ar` for `filtro`). */
  partSubtype?: string;
  /** OEM code detected either in raw text or via an OCR placeholder. */
  oemCode?: string;
}

/** Per-attribute confidence map (0..1). Keys mirror {@link IExtractedAttributes}. */
export type AttributeConfidence = Partial<Record<keyof IExtractedAttributes, number>>;

/** Decision the agent should take after an identification attempt. */
export type PartIdentificationActionKind = "confirm_auto" | "ask_user" | "request_more_info";

export interface IPartIdentificationDecision {
  kind: PartIdentificationActionKind;
  /** Human-readable hint exposed by the inspector. */
  reason: string;
  /** Specific missing attributes when `kind === 'request_more_info'`. */
  missingAttributes?: Array<keyof IExtractedAttributes>;
}

/** Single candidate part returned by the catalog search. */
export interface IPartCandidate {
  partId: ID;
  /** Snapshot of the part name at search-time (so the message body is stable). */
  partName: string;
  /** Vendor brand of the part — used to compose "Original / Equivalente" copy. */
  partBrand?: string;
  /** Aggregated score (0..1) computed by `scoreCandidate()`. */
  score: number;
  /** Attribute keys that contributed to the score (e.g. `['brand','model']`). */
  matchedAttributes: Array<keyof IExtractedAttributes>;
  /** True when the part is offered as an aftermarket equivalent, not the OEM. */
  isEquivalent: boolean;
  /** Optional price preview included in the confirmation message. */
  estimatedPrice?: Money;
  /** OEM code displayed alongside the candidate (first available). */
  oemCode?: string;
}

/**
 * Identification attempt — fully traced so the simulator inspector and the
 * audit log can replay how the engine arrived at its decision.
 */
export interface IPartIdentification {
  id: ID;
  conversationId: ID;
  /** SDR session that triggered the identification, when applicable. */
  sessionId?: ID;
  /** Customer utterance (or OCR placeholder caption) used as input. */
  rawInput: string;
  extractedAttributes: IExtractedAttributes;
  /** Per-attribute confidence map mirroring {@link IExtractedAttributes}. */
  attributeConfidence: AttributeConfidence;
  /** Aggregated confidence (0..1) over the extraction step. */
  confidence: number;
  candidates: IPartCandidate[];
  decision: IPartIdentificationDecision;
  status: PartIdentificationStatus;
  /** Filled when the customer confirmed one of the candidates. */
  customerConfirmedPartId?: ID;
  /** ISO timestamp of creation. */
  createdAt: ISO8601;
  /** ISO timestamp of the terminal status transition. */
  resolvedAt?: ISO8601;
}
