import type { ICustomer } from "@/shared/types";

export interface ICustomerFinance {
  /** Negotiated credit limit (BRL), when provisioned. */
  creditLimit?: number;
  /** Count of overdue receivable titles (demo data), when present and > 0. */
  overdueTitlesCount?: number;
  /** Flat catalog discount from the B2B contract (fraction 0..1), when present. */
  contractDiscountPct?: number;
  /** Extended payment terms from the B2B contract, when present. */
  contractPaymentTerms?: string;
  /** True when at least one financial fact is available to show. */
  hasAny: boolean;
}

/**
 * Collapse a customer's already-existing financial facts into a display model.
 * Everything is optional — the chip hides each element when absent (graceful
 * degradation). No new sources are introduced beyond the customer record.
 */
export function customerFinanceSummary(customer: ICustomer): ICustomerFinance {
  const creditLimit = customer.portalContract?.creditLimit ?? customer.portal?.creditLimit;
  const overdue =
    typeof customer.overdueTitlesCount === "number" && customer.overdueTitlesCount > 0
      ? customer.overdueTitlesCount
      : undefined;
  const contractDiscountPct = customer.portalContract?.discountPct;
  const contractPaymentTerms = customer.portalContract?.paymentTermsExtended;
  const hasAny =
    creditLimit !== undefined ||
    overdue !== undefined ||
    contractDiscountPct !== undefined ||
    Boolean(contractPaymentTerms);
  return {
    creditLimit,
    overdueTitlesCount: overdue,
    contractDiscountPct,
    contractPaymentTerms,
    hasAny,
  };
}
