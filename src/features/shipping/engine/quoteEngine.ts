import type {
  IMelhorEnvioConfig,
  IShippingQuoteOption,
  IShippingQuoteResult,
} from "@/shared/types";

/** Rounds to two decimal places (BRL cents). */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Applies the configured commercial markup on top of a carrier price.
 * `percent` adds `value`% of the price; `fixed` adds `value` reais.
 * The result is rounded to cents and never goes below zero.
 */
export function applyMarkup(price: number, markup: IMelhorEnvioConfig["markup"]): number {
  const raw = markup.type === "percent" ? price * (1 + markup.value / 100) : price + markup.value;
  return round2(Math.max(0, raw));
}

/** Returns the option with the lowest `finalPrice`, or `undefined` when empty. */
export function selectCheapest(
  options: ReadonlyArray<IShippingQuoteOption>,
): IShippingQuoteOption | undefined {
  return options.reduce<IShippingQuoteOption | undefined>((cheapest, option) => {
    if (!cheapest || option.finalPrice < cheapest.finalPrice) return option;
    return cheapest;
  }, undefined);
}

/**
 * Applies the free-shipping rule: when `freeAbove` is set and the order
 * `subtotal` reaches it (inclusive), the shipping value becomes zero.
 */
export function applyFreeShipping(
  price: number,
  subtotal: number,
  freeAbove?: number,
): { value: number; applied: boolean } {
  // epsilon guards float accumulation in the summed subtotal (see quoteTotals).
  if (freeAbove != null && subtotal >= freeAbove - 1e-9) {
    return { value: 0, applied: true };
  }
  return { value: round2(price), applied: false };
}

/**
 * Turns the raw carrier options returned by the provider into a resolved quote:
 * filters invalid/disallowed services, applies the markup to every option,
 * selects the cheapest and applies the free-shipping rule.
 *
 * Returns `null` when no usable option remains, signalling the orchestrator
 * (`useShippingQuote`) to fall back to the PRD-033 region rules.
 */
export function buildQuoteResult(
  rawOptions: ReadonlyArray<IShippingQuoteOption>,
  config: IMelhorEnvioConfig,
  subtotal: number,
): IShippingQuoteResult | null {
  const allowed = config.enabledServices ?? [];
  const usable = rawOptions.filter((option) => {
    if (!Number.isFinite(option.basePrice) || option.basePrice <= 0) return false;
    if (allowed.length > 0 && !allowed.includes(option.serviceId)) return false;
    return true;
  });

  if (usable.length === 0) return null;

  const options = usable.map<IShippingQuoteOption>((option) => ({
    ...option,
    finalPrice: applyMarkup(option.basePrice, config.markup),
  }));

  const selected = selectCheapest(options);
  if (!selected) return null;

  const freeShipping = applyFreeShipping(selected.finalPrice, subtotal, config.freeAboveSubtotal);

  return {
    source: "melhor_envio",
    options,
    selected,
    value: freeShipping.value,
    isToNegotiate: false,
    // Always an explicit boolean — `false` must survive into the snapshot so
    // Fase B can tell "rule evaluated, not applied" from "rule not configured".
    freeShippingApplied: freeShipping.applied,
  };
}
