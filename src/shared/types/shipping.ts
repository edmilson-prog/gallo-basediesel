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
  /**
   * Optional Melhor Envio integration (Épico "Melhor Envio" — Fase A).
   * When enabled, the quote screen fetches real shipping options by CEP and
   * the region `rates` above become the fallback. Stored in the JSONB
   * `stores.settings`, so it is fully backward-compatible (no schema migration).
   */
  melhorEnvio?: IMelhorEnvioConfig;
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

/* -------------------------------------------------------------------------- */
/* Melhor Envio — real-time quote (Épico "Melhor Envio" · Fase A)             */
/* -------------------------------------------------------------------------- */

/**
 * Per-store Melhor Envio configuration. Lives inside `IShippingConfig` (JSONB
 * `stores.settings`). Holds only non-secret data — OAuth credentials/tokens
 * live exclusively in the Supabase Vault, never here.
 */
export interface IMelhorEnvioConfig {
  /** Turns the automatic CEP-based quote on. When false, behaviour = PRD-033. */
  enabled: boolean;
  /** Selects the API base URL and which OAuth app the Edge talks to. */
  environment: "sandbox" | "production";
  /** Origin postal code of the store (Melhor Envio `from.postal_code`). */
  originZip: string;
  /** Default outer box used for the aggregated `package` (centimetres). */
  defaultBox: { heightCm: number; widthCm: number; lengthCm: number };
  /** Allowed service IDs (PAC=1, SEDEX=2, Jadlog .Package=3, .Com=4). Empty = all. */
  enabledServices: number[];
  /** Selection criterion. Fixed to `cheapest` in Fase A; reserved for evolution. */
  selectionCriterion: "cheapest";
  /** Commercial markup applied on top of the carrier price. `value: 0` = none. */
  markup: { type: "percent" | "fixed"; value: number };
  /** When the order subtotal reaches this amount, shipping is zeroed. */
  freeAboveSubtotal?: number;
  /** Contact e-mail for the mandatory `User-Agent` header (fallback to secret). */
  userAgentContact?: string;
}

/** A single carrier option returned by a quote (one row of the ME response). */
export interface IShippingQuoteOption {
  /** Numeric Melhor Envio service id (stable; names change). */
  serviceId: number;
  /** Human-readable service name ("PAC", "SEDEX", "Jadlog .Package"). */
  serviceName: string;
  companyId: number;
  companyName: string;
  /** Optional carrier logo URL provided by the API. */
  companyPicture?: string;
  /** Raw carrier price in BRL (before markup). */
  basePrice: number;
  /** Price after the configured markup — filled by the engine. */
  finalPrice: number;
  /** Estimated delivery time in business days. */
  deliveryDays: number;
  /** Optional delivery window when the API exposes a range. */
  deliveryRange?: { min: number; max: number };
}

/** Where a resolved shipping value came from. */
export type ShippingQuoteSource = "melhor_envio" | "region_rules" | "to_negotiate";

/**
 * Resolved quote applied to a quote/order. Produced by the engine
 * (`buildQuoteResult`) for Melhor Envio results, or mapped from
 * `calculateShipping` for the region-rules / to-negotiate fallback.
 */
export interface IShippingQuoteResult {
  source: ShippingQuoteSource;
  /** Carrier options — non-empty only when `source === "melhor_envio"`. */
  options: IShippingQuoteOption[];
  /** The chosen option (cheapest, post-markup) when available. */
  selected?: IShippingQuoteOption;
  /** Final value applied to the quote (BRL). `0` when `isToNegotiate`. */
  value: number;
  isToNegotiate: boolean;
  /** True when the free-shipping threshold zeroed the value. */
  freeShippingApplied?: boolean;
  /** ISO timestamp of when the quote was produced (stamped by the hook). */
  quotedAt?: string;
  notes?: string;
  error?: string;
}

/**
 * Lightweight snapshot persisted on the quote/order for traceability and reuse
 * by the deferred Fase B (label purchase).
 */
export interface IShippingQuoteSnapshot {
  source: ShippingQuoteSource;
  serviceId?: number;
  serviceName?: string;
  companyName?: string;
  /** Value applied to the quote (BRL). `0` when free shipping was applied. */
  price: number;
  /** Raw carrier price before markup/free-shipping — lets Fase B reconcile when `price` is 0. */
  basePrice?: number;
  /** True when the store's free-shipping rule zeroed `price` (vs a manual 0). */
  freeShippingApplied?: boolean;
  deliveryDays?: number;
  /** ISO timestamp of when the quote was produced. */
  quotedAt: string;
}
