import type { ICustomer, IOrder, OrderPaymentStatus } from "@/shared/types";

/**
 * Payment states that still consume the customer's credit line. `pago` and
 * `estornado` are settled and never count.
 */
const OPEN_PAYMENT_STATUSES: readonly OrderPaymentStatus[] = ["pendente", "parcial", "vencido"];

export interface ICustomerCredit {
  /** Granted limit in BRL. */
  limit: number;
  /** Sum of open-payment order totals in BRL. */
  used: number;
  /** `limit - used`, floored at zero. */
  free: number;
  /** Whole-number percentage of the limit consumed, capped at 100. */
  usedPct: number;
  /** Which side defined the limit — drives the "ERP" marker in the UI. */
  source: "platform" | "erp";
}

/**
 * Resolve the customer's credit position.
 *
 * The limit comes from the platform (`creditLimit`) and falls back to the
 * DINTEC snapshot (`dintecCreditLimit`). The consumed portion is DERIVED from
 * orders — there is no stored "used" anywhere in the schema, and no accounts
 * receivable module exists yet, so an order whose payment is still open is the
 * only available proxy.
 *
 * Returns `null` when no limit was ever defined, so the UI can omit the cell
 * entirely instead of rendering a hollow "R$ 0".
 */
export function resolveCustomerCredit(
  customer: ICustomer,
  orders: IOrder[],
): ICustomerCredit | null {
  const fromPlatform = customer.creditLimit;
  const limit = fromPlatform ?? customer.dintecCreditLimit;
  if (limit == null) return null;

  const used = orders.reduce((sum, order) => {
    if (order.canceledAt) return sum;
    if (!OPEN_PAYMENT_STATUSES.includes(order.paymentStatus)) return sum;
    return sum + order.total;
  }, 0);

  return {
    limit,
    used,
    free: Math.max(0, limit - used),
    usedPct: limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 0,
    source: fromPlatform != null ? "platform" : "erp",
  };
}
