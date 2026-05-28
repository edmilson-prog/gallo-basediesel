import type { ICustomer } from "@/shared/types";

/** Best display name for a customer in the compact PWA UI. */
export function customerLabel(c: ICustomer | null | undefined): string {
  if (!c) return "Cliente";
  return c.type === "B2B" ? c.nomeFantasia || c.razaoSocial : c.fullName;
}
