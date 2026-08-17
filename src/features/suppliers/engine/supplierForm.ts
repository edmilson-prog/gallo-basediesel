import type { CnpjLookupStatus } from "@/features/customers/hooks/useMinhaReceita";
import { isValidCnpj } from "@/features/customers/utils/cnpjCpf";

/**
 * State of the CNPJ field on the supplier form. Mirrors the customer form's
 * `newCustomerLookup` — same precedence, minus the CPF branch (a supplier is
 * always a company) and minus the manual-fill escape (the Receita being down
 * never blocks a supplier, so there is nothing to escape from).
 *
 * User-facing copy for each state lives in `SUPPLIERS_STRINGS.form.docMessages`
 * (`../i18n/pt-BR.ts`), not here — this module stays pure state derivation.
 */
export type SupplierDocState =
  | "idle"
  | "typing"
  | "invalid"
  | "loading"
  | "duplicate"
  | "notfound"
  | "error"
  | "done";

export interface ISupplierDocInput {
  /** Document digits, unmasked. */
  digits: string;
  /**
   * The debounced lookups haven't caught up with what's typed. While true,
   * `cnpjStatus` and `duplicateFound` still describe the PREVIOUS document.
   */
  pending: boolean;
  cnpjStatus: CnpjLookupStatus;
  duplicateFound: boolean;
}

export function resolveSupplierDocState(input: ISupplierDocInput): SupplierDocState {
  if (!input.digits) return "idle";
  if (input.digits.length < 14) return "typing";
  if (!isValidCnpj(input.digits)) return "invalid";
  if (input.pending || input.cnpjStatus === "loading") return "loading";
  if (input.duplicateFound) return "duplicate";
  if (input.cnpjStatus === "invalid") return "notfound";
  if (input.cnpjStatus === "error") return "error";
  if (input.cnpjStatus === "success") return "done";
  return "loading";
}

export function canSaveSupplier(input: { name: string; docState: SupplierDocState }): boolean {
  if (input.name.trim().length < 3) return false;
  return !["loading", "duplicate", "invalid"].includes(input.docState);
}
