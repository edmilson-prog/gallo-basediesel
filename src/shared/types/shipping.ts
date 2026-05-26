import type { ID, Money } from "./common";

/**
 * Shipping calculation strategy (PRD-033).
 *
 * - `fixed_by_region`: looks up the first active rate whose criteria match the
 *   address and returns its `baseValue`. Default for the MVP.
 * - `to_negotiate_default`: always returns `isToNegotiate: true`. Useful for
 *   stores that prefer to discuss shipping manually with each customer.
 * - `preliminary_by_weight`: same matching as `fixed_by_region`, but adds
 *   `weightSurcharge * totalWeight` on top of `baseValue` when the matched
 *   rate defines a `weightSurcharge`.
 */
export type ShippingStrategy = "fixed_by_region" | "to_negotiate_default" | "preliminary_by_weight";

/**
 * Geographic scope of a shipping rate.
 *
 * - `city`: matches when the customer city is in `cities`.
 * - `state`: matches when the customer UF equals the single entry in `states`.
 * - `states`: matches when the customer UF is in `states` (multi-state).
 * - `nationwide`: matches anywhere in Brazil — used as the broadest fallback.
 */
export type ShippingScope = "city" | "state" | "states" | "nationwide";

/** What to do when no rate matches the customer address. */
export type ShippingDefaultAction = "to_negotiate" | "fixed_value";

/** Reason bit used by the inspector / templates to explain the result. */
export type ShippingResultReason =
  | "matched_rate"
  | "no_match_negotiate"
  | "no_match_fixed"
  | "missing_address"
  | "strategy_to_negotiate"
  | "no_active_rules";

/**
 * Single shipping rate — geographic scope + base value, optionally with a
 * per-kilogram surcharge applied when the strategy is `preliminary_by_weight`.
 */
export interface IShippingRate {
  id: ID;
  /** Human-readable name shown on the admin table ("Frederico Westphalen", "SC + PR"). */
  name: string;
  scope: ShippingScope;
  /** Used when `scope === 'city'`. Case-insensitive compare. */
  cities?: string[];
  /** Used when `scope === 'state'` (single UF) or `scope === 'states'` (multi). */
  states?: string[];
  /** Base value applied when the rate matches. BRL. */
  baseValue: Money;
  /** Optional surcharge in R$/kg used only by `preliminary_by_weight`. */
  weightSurcharge?: number;
  /** Disabled rates are skipped during match (kept in config for history). */
  isActive: boolean;
}

/**
 * Per-store shipping configuration. Lives at `IPlatformSettings.shipping` and
 * is edited via `/app/configuracoes/frete` (PRD-033).
 */
export interface IShippingConfig {
  strategy: ShippingStrategy;
  rates: IShippingRate[];
  /** Behaviour when no rate matches or no active rules exist. */
  defaultWhenNoMatch: ShippingDefaultAction;
  /** Required when `defaultWhenNoMatch === 'fixed_value'`. */
  defaultFallbackValue?: Money;
}

/** Outcome of a `calculateShipping()` call. */
export interface IShippingResult {
  /** Computed value when applicable. Absent when `isToNegotiate`. */
  value?: Money;
  /** True when the quote/order should render "a combinar" instead of a number. */
  isToNegotiate: boolean;
  /** Rate that matched, when any. */
  appliedRate?: IShippingRate;
  /** Customer-facing note ("a combinar", "cálculo preliminar"). */
  notes?: string;
  /** Trace bit consumed by the inspector and tests. */
  reason: ShippingResultReason;
}
