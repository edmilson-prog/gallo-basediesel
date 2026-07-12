import type { ABCClass, ICustomer, ISO8601, Money } from "@/shared/types";

/** A stat value paired with whether it came from the DINTEC ERP snapshot fallback. */
export interface IResolvedStat<T> {
  value: T;
  fromDintec: boolean;
}

export interface IResolvedPurchaseStats {
  ticketMedio?: IResolvedStat<Money>;
  ltv?: IResolvedStat<Money>;
  /**
   * ALL-TIME invoice count when `fromDintec` is true (dintec_frequencia has
   * no 12-month window in the source ERP) vs. a strict last-12-months order
   * count when `fromDintec` is false — callers must label these differently.
   */
  frequencia?: IResolvedStat<number>;
}

/**
 * Ticket médio / LTV / frequência all come from the SAME source together
 * (the platform's `purchaseStats` snapshot, or none of them) — falls back to
 * the DINTEC columns field-by-field only when `purchaseStats` is entirely
 * absent, since a real order in-platform is always the source of truth once
 * it exists.
 */
export function resolvePurchaseStats(customer: ICustomer): IResolvedPurchaseStats {
  if (customer.purchaseStats) {
    return {
      ticketMedio: { value: customer.purchaseStats.ticketMedio, fromDintec: false },
      ltv: { value: customer.purchaseStats.ltv, fromDintec: false },
      frequencia: { value: customer.purchaseStats.orderCount12m, fromDintec: false },
    };
  }
  const result: IResolvedPurchaseStats = {};
  if (customer.dintecTicketMedio != null) {
    result.ticketMedio = { value: customer.dintecTicketMedio, fromDintec: true };
  }
  if (customer.dintecLtv != null) {
    result.ltv = { value: customer.dintecLtv, fromDintec: true };
  }
  if (customer.dintecFrequencia != null) {
    result.frequencia = { value: customer.dintecFrequencia, fromDintec: true };
  }
  return result;
}

/** Falls back to `dintecLastPurchaseAt` only when the platform has no real last purchase. */
export function resolveLastPurchaseAt(customer: ICustomer): IResolvedStat<ISO8601> | undefined {
  if (customer.lastPurchaseAt) return { value: customer.lastPurchaseAt, fromDintec: false };
  if (customer.dintecLastPurchaseAt) return { value: customer.dintecLastPurchaseAt, fromDintec: true };
  return undefined;
}

/** Falls back to `dintecFirstPurchaseAt` only when the platform has no real first purchase. */
export function resolveFirstPurchaseAt(customer: ICustomer): IResolvedStat<ISO8601> | undefined {
  if (customer.firstPurchaseAt) return { value: customer.firstPurchaseAt, fromDintec: false };
  if (customer.dintecFirstPurchaseAt) return { value: customer.dintecFirstPurchaseAt, fromDintec: true };
  return undefined;
}

export interface IResolvedAbc {
  abcClass: ABCClass;
  abcShare?: number;
  fromDintec: boolean;
}

/**
 * ABC class + share always come from the SAME source together — a platform
 * class without a platform share never gets a DINTEC share grafted on (and
 * vice versa), since the two numbers only make sense paired.
 */
export function resolveAbc(customer: ICustomer): IResolvedAbc | undefined {
  if (customer.abcClass) {
    return { abcClass: customer.abcClass, abcShare: customer.abcShare, fromDintec: false };
  }
  if (customer.dintecAbcClass) {
    return { abcClass: customer.dintecAbcClass, abcShare: customer.dintecPctReceita, fromDintec: true };
  }
  return undefined;
}
