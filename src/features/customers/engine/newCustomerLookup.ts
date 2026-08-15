import type { ICustomer } from "@/shared/types";
import type { CnpjLookupStatus } from "../hooks/useMinhaReceita";
import { isValidCnpj, isValidCpf } from "../utils/cnpjCpf";

/**
 * State of the document field on the "Novo cliente" form — one value drives the
 * adornment icon, the status line under the field, which panel is shown and
 * whether creation is allowed.
 *
 * Deliberately a single enum instead of a pile of booleans: the states are
 * mutually exclusive by construction, and the precedence between them (a
 * duplicate outranks a successful Receita lookup, a stale lookup outranks
 * everything) is the whole point of this module.
 */
export type NewCustomerDocState =
  /** Nothing typed yet. */
  | "idle"
  /** Some digits, not a whole document. */
  | "typing"
  /** Complete, but the check digits don't add up — never leaves the browser. */
  | "invalid"
  /** A lookup (Receita and/or duplicate guard) is in flight or stale. */
  | "loading"
  /** The store already has a customer with this document. Blocks creation. */
  | "duplicate"
  /** Valid CNPJ the Receita mirror doesn't know. */
  | "notfound"
  /** The Receita mirror couldn't be reached. Never blocks creation. */
  | "error"
  /** Document accepted — CNPJ confirmed by the Receita, or a valid CPF. */
  | "done"
  /** Valid CNPJ the user chose to fill in by hand after a failed lookup. */
  | "manual";

export interface INewCustomerDocInput {
  type: ICustomer["type"];
  /** Document digits, unmasked. */
  digits: string;
  /**
   * The debounced lookups haven't caught up with what's typed yet. While true,
   * `cnpjStatus` and `duplicateFound` still describe the PREVIOUS document, so
   * nothing derived from them can be trusted — pasting a duplicate and hitting
   * "Criar" inside that window is exactly the race this guards.
   */
  pending: boolean;
  cnpjStatus: CnpjLookupStatus;
  duplicateFound: boolean;
  /** The user clicked "Preencher manualmente" after a failed lookup. */
  manual: boolean;
}

/** Digits a complete document has, per customer type. */
export function documentLength(type: ICustomer["type"]): number {
  return type === "B2B" ? 14 : 11;
}

/** Check-digit validation for whichever document the type calls for. */
export function isValidDocument(type: ICustomer["type"], digits: string): boolean {
  return type === "B2B" ? isValidCnpj(digits) : isValidCpf(digits);
}

/**
 * Single source of truth for the document field's state.
 *
 * Precedence, highest first: incomplete input → bad check digits → duplicate →
 * stale/in-flight lookup → the user's manual override → the Receita's answer.
 * A CPF has no public lookup, so a valid one lands straight on `done`.
 */
export function deriveDocState({
  type,
  digits,
  pending,
  cnpjStatus,
  duplicateFound,
  manual,
}: INewCustomerDocInput): NewCustomerDocState {
  if (digits.length === 0) return "idle";
  if (digits.length < documentLength(type)) return "typing";
  if (!isValidDocument(type, digits)) return "invalid";
  if (duplicateFound && !pending) return "duplicate";
  if (pending) return "loading";
  if (type === "B2C") return "done";
  if (manual) return "manual";

  switch (cnpjStatus) {
    case "success":
      return "done";
    case "invalid":
      return "notfound";
    case "error":
      return "error";
    // "idle" only happens for the instant between the debounce landing and the
    // request starting — reading it as "checking" keeps the button honest.
    case "loading":
    case "idle":
    default:
      return "loading";
  }
}

/** The document half of the submit gate. The name/phone/seller half lives in the form. */
export function canSubmitDocument(state: NewCustomerDocState): boolean {
  return state === "done" || state === "manual";
}

/** Whether a failed lookup should offer the "Preencher manualmente" escape hatch. */
export function offersManualFill(state: NewCustomerDocState): boolean {
  return state === "notfound" || state === "error";
}
