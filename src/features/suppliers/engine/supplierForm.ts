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

export interface ISupplierDocLookupState {
  /** Live, unmasked digits currently in the field. */
  digits: string;
  /** Digits the debounce has settled on. */
  debouncedDigits: string;
  /**
   * Digits the Receita lookup + duplicate-check effects have actually run
   * for (dispatched a request, or reset because the document went invalid) —
   * i.e. what the currently-held `cnpjStatus`/`duplicateChecking` describe.
   * `null` before any effect has run for the live debounce cycle.
   */
  dispatchedForDigits: string | null;
  cnpjStatus: CnpjLookupStatus;
  duplicateChecking: boolean;
}

/**
 * Whether the CNPJ field is still resolving, in the sense that `cnpjStatus`
 * and `duplicateFound` cannot yet be trusted to describe the document
 * currently showing in the field.
 *
 * This exists because of a one-render gap that `digits !== debouncedDigits`
 * alone does not cover: the render where the debounce has JUST settled on a
 * new, different document, but the effects that dispatch the Receita lookup
 * and the duplicate check have not run yet. In that render `cnpjStatus` and
 * `duplicateFound` still describe the PREVIOUS document — trusting them would
 * let an unverified (possibly duplicate) document read as `"done"` for one
 * frame. Comparing `debouncedDigits` against `dispatchedForDigits` (a value
 * the caller updates only once its effects have actually run for that
 * target) catches this immediately, without waiting for `cnpjStatus` to
 * eventually flip to `"loading"` one render later.
 */
export function isSupplierDocLookupPending(input: ISupplierDocLookupState): boolean {
  if (input.digits.length !== 14) return false;
  if (input.digits !== input.debouncedDigits) return true;
  if (input.dispatchedForDigits !== input.debouncedDigits) return true;
  if (input.cnpjStatus === "loading") return true;
  if (input.duplicateChecking) return true;
  return false;
}
