import type { ID, ISO8601, Money } from "./common";

/**
 * SDR quote template slots edited by Owners on
 * `/app/configuracoes/sdr/orcamento` (PRD-022 RF-002/030). Each slot is a
 * plain string with `{{variavel}}` placeholders rendered by
 * `renderQuoteMessage()`.
 *
 * @see ../../../docs/prds/PRD-022-orcamento-sdr.md
 */
export interface ISdrQuoteTemplates {
  /** Initial quote message sent to the customer after identification confirms. */
  generation: string;
  /** Reply when the customer accepts the quote — asks for payment & delivery. */
  accept: string;
  /** Reply when the customer rejects — offers other options. */
  reject: string;
  /** Reply when the customer asks for a seller or to negotiate. */
  escalate: string;
}

/** Default behaviour when the customer's state is outside the supported ones. */
export type SdrOtherStatesAction = "to_negotiate" | "fixed_value";

/**
 * Placeholder shipping settings consumed by `calculateShippingPlaceholder()`
 * until PRD-033 (frete real) ships. Values are in BRL.
 *
 * @see ../../../../features/sdr-quote/engine/shipping.ts
 */
export interface ISdrShippingPlaceholderSettings {
  /** Flat value applied when the customer lives in the store's own city. */
  sameCityValue: Money;
  /** Flat value applied when the customer is in the same state (other city). */
  sameStateValue: Money;
  /** What to do when the customer is in another state. */
  otherStatesAction: SdrOtherStatesAction;
  /** Used only when `otherStatesAction === 'fixed_value'`. */
  otherStatesValue?: Money;
  /**
   * City the store is located in (lower-cased compare). Used to short-circuit
   * the `sameCityValue` rule.
   */
  homeCity: string;
  /** State the store is located in (UF, 2 letters). */
  homeState: string;
}

/** Outcome of a placeholder shipping calculation. */
export interface ISdrShippingResult {
  /** Computed value when applicable. */
  value?: Money;
  /** True when the agent should render "a combinar" instead of a number. */
  isToNegotiate: boolean;
  /** Trace bit consumed by the inspector. */
  reason:
    | "same_city"
    | "same_state"
    | "other_state_fixed"
    | "other_state_negotiate"
    | "missing_address";
}

/** Coarse intent of a customer reply to a quote. */
export type QuoteResponseIntent = "accept" | "reject" | "escalate" | "negotiate" | "unknown";

export interface IQuoteResponseMatch {
  intent: QuoteResponseIntent;
  /** Keywords that triggered the classification — surfaced on the inspector. */
  matchedKeywords: string[];
}

/**
 * Lightweight projection of a quote used by the SDR session to know what is
 * pending. Kept separate from `IQuote` so the session does not carry the
 * whole commercial record around.
 */
export interface ISdrPendingQuote {
  quoteId: ID;
  total: Money;
  validUntil: ISO8601;
  /** Snapshot of the part name displayed on the inspector. */
  partName: string;
  /** Snapshot of the part id — used to build follow-up messages. */
  partId: ID;
  /** True when the quote was rendered with "a combinar" for shipping. */
  shippingIsToNegotiate: boolean;
  createdAt: ISO8601;
}
