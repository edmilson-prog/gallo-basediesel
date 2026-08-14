import type { ILead } from "@/shared/types";
import {
  formatCnpj,
  formatCpf,
  isValidCnpj,
  isValidCpf,
  onlyDigits,
} from "@/features/customers/utils/cnpjCpf";

/**
 * How ready a lead is to become a customer, field by field.
 *
 * The panel used to answer "what does this lead have?" and left "can I convert
 * it?" to whoever opened the conversion modal and read its validation errors.
 * This says it up front, in the order the kit lists it
 * (ui_kits/atendimento/painel/painel-lead-v2-conversao.html), so the seller can
 * collect what is missing DURING the conversation instead of at the end of it.
 *
 * The required set is not invented here — it mirrors `ConvertLeadModal.validate`
 * exactly, which is the thing that actually refuses:
 *  - B2C wants a full name and 11 valid CPF digits;
 *  - B2B wants 14 valid CNPJ digits plus razão/fantasia/contato, and the modal
 *    pre-fills all three (from `lead.name` and the Receita lookup the CNPJ
 *    triggers).
 * So a lead carrying name + a valid document really does convert in one click,
 * and this file is allowed to say so.
 */

/**
 * Tag that marks a contact nobody intends to turn into a customer — the kit's
 * "É pessoal" escape hatch.
 *
 * A tag rather than a column: `leads.tags` already exists, already filters, and
 * already syncs to the customer on conversion, so the decision survives in a
 * place the rest of the product can read. A boolean column would have been a
 * second vocabulary for "what kind of contact is this".
 */
export const PERSONAL_LEAD_TAG = "pessoal";

export function isPersonalLead(lead: Pick<ILead, "tags">): boolean {
  return lead.tags.some((tag) => tag.trim().toLowerCase() === PERSONAL_LEAD_TAG);
}

/** Adds or removes the tag, preserving every other tag and their order. */
export function togglePersonalTag(tags: string[]): string[] {
  const has = tags.some((tag) => tag.trim().toLowerCase() === PERSONAL_LEAD_TAG);
  return has
    ? tags.filter((tag) => tag.trim().toLowerCase() !== PERSONAL_LEAD_TAG)
    : [...tags, PERSONAL_LEAD_TAG];
}

export type ConversionFieldId = "phone" | "name" | "document" | "email" | "address";

/** Advisory rendered under a row; the copy itself lives in the i18n file. */
export type ConversionFieldHint = "whatsappName";

export interface IConversionField {
  id: ConversionFieldId;
  /** Conversion is refused without it. */
  required: boolean;
  filled: boolean;
  /** Display-ready value, or null while unfilled. */
  value: string | null;
  hint: ConversionFieldHint | null;
}

export interface IConversionReadiness {
  fields: IConversionField[];
  filledCount: number;
  total: number;
  /** 0–100, drives the ring. */
  percent: number;
  /** Required fields still missing, in display order. */
  missingRequired: IConversionField[];
  /** True when every REQUIRED field is answered — optional ones may be empty. */
  ready: boolean;
}

/**
 * A document is only "answered" when it could actually be submitted: the
 * conversion modal runs the same check digits, so accepting 11 arbitrary digits
 * here would promise a one-click conversion that then bounces.
 */
export function isConversionDocument(value: string | null | undefined): boolean {
  if (!value) return false;
  const digits = onlyDigits(value);
  if (digits.length === 11) return isValidCpf(digits);
  if (digits.length === 14) return isValidCnpj(digits);
  return false;
}

/** `B2B` for 14 digits, `B2C` for 11 — what the modal should open as. */
export function documentCustomerType(value: string | null | undefined): "B2B" | "B2C" | null {
  if (!isConversionDocument(value)) return null;
  return onlyDigits(value as string).length === 14 ? "B2B" : "B2C";
}

export function formatConversionDocument(value: string): string {
  const digits = onlyDigits(value);
  return digits.length === 14 ? formatCnpj(digits) : formatCpf(digits);
}

/**
 * A name counts as answered unless it is plainly not one — empty, or the phone
 * number wearing a name's clothes (imports and the webhook both fall back to
 * the number when WhatsApp gives no push name).
 *
 * Deliberately permissive: this gates the convert button, and a single-word
 * company name ("Transbrasa") is a real name. The "this is probably just the
 * WhatsApp name" doubt is reported as a HINT instead, where it informs without
 * blocking.
 */
export function isConversionName(name: string | null | undefined, phone?: string): boolean {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return false;
  const digits = onlyDigits(trimmed);
  // All digits, or the lead's own number spelled out — not a name either way.
  if (digits.length > 0 && digits.length === trimmed.replace(/[\s()+.-]/g, "").length) return false;
  if (phone && digits.length > 0 && digits === onlyDigits(phone)) return false;
  return true;
}

/** One bare token — the shape a WhatsApp push name usually arrives in. */
function looksLikePushName(name: string | null | undefined): boolean {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return false;
  return trimmed.split(/\s+/).length === 1;
}

function addressLabel(lead: ILead): string | null {
  const address = lead.address;
  if (!address) return null;
  const city = address.city?.trim();
  const state = address.state?.trim();
  if (city && state) return `${city} / ${state}`;
  return city || state || null;
}

export function getConversionReadiness(lead: ILead): IConversionReadiness {
  const nameFilled = isConversionName(lead.name, lead.phone);
  const documentFilled = isConversionDocument(lead.document);
  const email = lead.email?.trim() ?? "";
  const address = addressLabel(lead);

  const fields: IConversionField[] = [
    {
      id: "phone",
      required: true,
      // The conversation exists because a number does; there is no lead without
      // one. Listed anyway because the checklist is a statement of what the
      // record holds, and a list that only shows gaps reads as an error report.
      filled: !!lead.phone?.trim(),
      value: lead.phone?.trim() || null,
      hint: null,
    },
    {
      id: "name",
      required: true,
      filled: nameFilled,
      value: nameFilled ? lead.name.trim() : null,
      hint: looksLikePushName(lead.name) ? "whatsappName" : null,
    },
    {
      id: "document",
      required: true,
      filled: documentFilled,
      value: documentFilled ? formatConversionDocument(lead.document as string) : null,
      hint: null,
    },
    { id: "email", required: false, filled: !!email, value: email || null, hint: null },
    { id: "address", required: false, filled: !!address, value: address, hint: null },
  ];

  const filledCount = fields.filter((f) => f.filled).length;
  const missingRequired = fields.filter((f) => f.required && !f.filled);

  return {
    fields,
    filledCount,
    total: fields.length,
    percent: Math.round((filledCount / fields.length) * 100),
    missingRequired,
    ready: missingRequired.length === 0,
  };
}
