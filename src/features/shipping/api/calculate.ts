import type {
  ICustomerAddress,
  IShippingConfig,
  IShippingRate,
  IShippingResult,
  IOrderItem,
  IQuoteItem,
} from "@/shared/types";

/**
 * Item shape accepted by the optional weight calculation. Both `IQuoteItem`
 * and `IOrderItem` qualify; arbitrary objects also work as long as they
 * expose `quantity` and (optionally) `weightKg`.
 */
export interface IShippingItemInput {
  quantity: number;
  /** Per-unit weight in kilograms. When absent the item is treated as 0kg. */
  weightKg?: number;
}

export interface ICalculateShippingInput {
  /** Customer address — falls back to "missing_address" when undefined. */
  address?: ICustomerAddress;
  /** Items used by `preliminary_by_weight`. Optional for other strategies. */
  items?: ReadonlyArray<IShippingItemInput | IQuoteItem | IOrderItem>;
  /** Manual override for total weight in kg. Wins over `items` when both set. */
  totalWeightKg?: number;
  /** Active configuration (typically `settings.shipping`). */
  config: IShippingConfig;
}

const normalize = (input: string): string => input.trim().toLowerCase();
const normalizeUf = (input: string): string => input.trim().toUpperCase();

function rateMatches(rate: IShippingRate, address: ICustomerAddress): boolean {
  if (!rate.isActive) return false;
  switch (rate.scope) {
    case "city": {
      if (!address.city || !rate.cities?.length) return false;
      const target = normalize(address.city);
      return rate.cities.some((c) => normalize(c) === target);
    }
    case "state": {
      if (!address.state || !rate.states?.length) return false;
      return normalizeUf(rate.states[0]!) === normalizeUf(address.state);
    }
    case "states": {
      if (!address.state || !rate.states?.length) return false;
      const uf = normalizeUf(address.state);
      return rate.states.some((s) => normalizeUf(s) === uf);
    }
    case "nationwide":
      return true;
    default:
      return false;
  }
}

/** Specificity rank — lower means more specific and wins first. */
const SCOPE_ORDER: Record<IShippingRate["scope"], number> = {
  city: 0,
  state: 1,
  states: 2,
  nationwide: 3,
};

function findRate(
  rates: ReadonlyArray<IShippingRate>,
  address: ICustomerAddress,
): IShippingRate | undefined {
  return [...rates]
    .filter((r) => r.isActive)
    .sort((a, b) => SCOPE_ORDER[a.scope] - SCOPE_ORDER[b.scope])
    .find((r) => rateMatches(r, address));
}

function sumItemWeight(items: ReadonlyArray<IShippingItemInput | IQuoteItem | IOrderItem>): number {
  let total = 0;
  for (const it of items) {
    const weight = (it as IShippingItemInput).weightKg ?? 0;
    total += weight * (it.quantity ?? 0);
  }
  return total;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function fallbackResult(
  config: IShippingConfig,
  reason: IShippingResult["reason"],
): IShippingResult {
  if (config.defaultWhenNoMatch === "fixed_value" && config.defaultFallbackValue != null) {
    return {
      value: round2(config.defaultFallbackValue),
      isToNegotiate: false,
      notes: "Valor padrão de frete aplicado.",
      reason: reason === "no_active_rules" ? "no_active_rules" : "no_match_fixed",
    };
  }
  return {
    isToNegotiate: true,
    notes: "Frete a combinar.",
    reason: reason === "no_active_rules" ? "no_active_rules" : "no_match_negotiate",
  };
}

/**
 * Pure shipping calculator (PRD-033 RF-004/RF-005). Replaces the per-feature
 * stubs that lived inside PRDs 022, 031 and 032. The signature is stable so a
 * Fase 2 transporter integration can drop in without touching consumers.
 *
 * Decision flow:
 *  1. `strategy === 'to_negotiate_default'` → always "a combinar".
 *  2. Missing/empty address → "a combinar" with reason `missing_address`.
 *  3. No active rules → `defaultWhenNoMatch` fallback.
 *  4. Match an active rate by specificity (city → state → states → nationwide).
 *  5. When `strategy === 'preliminary_by_weight'` and the matched rate has a
 *     `weightSurcharge`, add `weightSurcharge * totalWeight` to `baseValue`.
 *  6. No match → `defaultWhenNoMatch` fallback.
 */
export function calculateShipping(input: ICalculateShippingInput): IShippingResult {
  const { config, address } = input;

  if (config.strategy === "to_negotiate_default") {
    return {
      isToNegotiate: true,
      notes: "Frete a combinar.",
      reason: "strategy_to_negotiate",
    };
  }

  const activeRates = config.rates.filter((r) => r.isActive);
  if (activeRates.length === 0) {
    return fallbackResult(config, "no_active_rules");
  }

  if (!address || (!address.city && !address.state)) {
    return {
      isToNegotiate: true,
      notes: "Endereço incompleto — frete a combinar.",
      reason: "missing_address",
    };
  }

  const matched = findRate(config.rates, address);
  if (!matched) {
    return fallbackResult(config, "no_match_negotiate");
  }

  let value = matched.baseValue;
  let notes: string | undefined;

  if (
    config.strategy === "preliminary_by_weight" &&
    matched.weightSurcharge &&
    matched.weightSurcharge > 0
  ) {
    const totalWeight =
      input.totalWeightKg != null
        ? Math.max(0, input.totalWeightKg)
        : input.items
          ? sumItemWeight(input.items)
          : 0;
    if (totalWeight > 0) {
      value = matched.baseValue + matched.weightSurcharge * totalWeight;
      notes = `Cálculo preliminar baseado em peso (${totalWeight.toFixed(1)}kg × R$ ${matched.weightSurcharge.toFixed(2)}/kg).`;
    }
  }

  return {
    value: round2(value),
    isToNegotiate: false,
    appliedRate: matched,
    notes,
    reason: "matched_rate",
  };
}
