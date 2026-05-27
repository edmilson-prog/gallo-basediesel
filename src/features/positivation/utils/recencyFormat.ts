import { formatRelativeTimeBR } from "@/shared/utils/format";

/** Friendly recency text — "há 5 dias" or "sem compras". */
export function formatRecency(iso: string | undefined): string {
  if (!iso) return "Sem compras";
  return formatRelativeTimeBR(iso);
}

/** Customer display name without leaking B2B / B2C branching to the UI. */
export function displayCustomerName(customer: {
  type: "B2B" | "B2C";
  nomeFantasia?: string;
  razaoSocial?: string;
  fullName?: string;
}): string {
  if (customer.type === "B2B") {
    return customer.nomeFantasia ?? customer.razaoSocial ?? "—";
  }
  return customer.fullName ?? "—";
}
