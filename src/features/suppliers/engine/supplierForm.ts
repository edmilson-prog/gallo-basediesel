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

/**
 * States that a 14-digit CNPJ has passed its checksum and cleared the
 * duplicate guard — i.e. a lookup outcome the caller can actually submit.
 * `notfound`/`error` belong here on purpose: the Receita being unreachable,
 * or simply not having the CNPJ on file, must never block a legitimate
 * cadastro — only a checksum failure or a confirmed duplicate does that. See
 * `canSaveSupplier`'s "create" branch.
 */
const RESOLVED_DOC_STATES: SupplierDocState[] = ["done", "notfound", "error"];

export function canSaveSupplier(input: {
  name: string;
  docState: SupplierDocState;
  /**
   * `"edit"` (default) preserves the original behavior: a supplier record
   * already has a row, so an absent/partial document blocks nothing — only
   * `supplierDocumentPatchValue`'s three-way split decides what happens to
   * the stored column. `"create"` additionally requires a fully resolved
   * CNPJ, because the Tally's `suppliers.cnpj` column is `NOT NULL`.
   */
  mode?: "create" | "edit";
}): boolean {
  if (input.name.trim().length < 3) return false;
  if (["loading", "duplicate", "invalid"].includes(input.docState)) return false;
  if ((input.mode ?? "edit") === "create") return RESOLVED_DOC_STATES.includes(input.docState);
  return true;
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

/**
 * What the form should submit for the `document` column, given the field's
 * live digits. Three cases, not two:
 *
 * - Empty (0 digits) — the user deliberately cleared the field. Submits
 *   `""`, which `patchToRow`/`create` map to `null`: clear the column.
 * - Partial (1–13 digits) — a document mid-retype, neither "no document" nor
 *   a confirmed one. Submits `undefined`, which `IUpdateSupplierPatch`
 *   treats as "don't touch this column" — whatever was already saved
 *   survives. Collapsing this case into the empty-field one was a real bug:
 *   backspacing a few digits of a saved CNPJ and saving before retyping all
 *   14 used to null out a previously valid, stored document.
 * - Complete (14 digits) — the digits themselves. By the time this is
 *   called, `canSaveSupplier` has already refused a checksum-invalid
 *   14-digit value (`docState: "invalid"`), so 14 digits here is always a
 *   valid CNPJ.
 */
export function supplierDocumentPatchValue(digits: string): string | undefined {
  if (digits.length === 14) return digits;
  if (digits.length === 0) return "";
  return undefined;
}
