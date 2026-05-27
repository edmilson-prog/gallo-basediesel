import type { ICustomer } from "@/shared/types";

/** Display name without leaking B2B / B2C branching to the UI. */
export function displayCustomerName(customer: ICustomer | undefined | null): string {
  if (!customer) return "—";
  if (customer.type === "B2B") {
    return customer.nomeFantasia || customer.razaoSocial || "—";
  }
  return customer.fullName || "—";
}
