import type { ICustomer, ICustomerAddress } from "@/shared/types";
import { formatCnpj, formatCpf, isValidCnpj, isValidCpf, onlyDigits } from "./cnpjCpf";
import { CUSTOMER_STRINGS } from "../i18n/pt-BR";

const ERR = CUSTOMER_STRINGS.overview.cadastrais.errors;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Form snapshot of the editable cadastral fields — all plain strings. */
export interface ICustomerDraft {
  razaoSocial: string;
  nomeFantasia: string;
  cnpj: string;
  contactName: string;
  fullName: string;
  cpf: string;
  email: string;
  street: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state: string;
  zipCode: string;
}

export interface ICustomerDraftErrors {
  razaoSocial?: string;
  cnpj?: string;
  fullName?: string;
  cpf?: string;
  email?: string;
  street?: string;
  city?: string;
  state?: string;
  zipCode?: string;
}

export function formatCep(value: string): string {
  const d = onlyDigits(value).slice(0, 8);
  return d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`;
}

export function toCustomerDraft(customer: ICustomer): ICustomerDraft {
  const address = customer.address;
  return {
    razaoSocial: customer.type === "B2B" ? customer.razaoSocial : "",
    nomeFantasia: customer.type === "B2B" ? customer.nomeFantasia : "",
    cnpj: customer.type === "B2B" ? formatCnpj(customer.cnpj) : "",
    contactName: customer.type === "B2B" ? customer.contactName : "",
    fullName: customer.type === "B2C" ? customer.fullName : "",
    cpf: customer.type === "B2C" ? formatCpf(customer.cpf) : "",
    email: customer.email ?? "",
    street: address?.street ?? "",
    number: address?.number ?? "",
    complement: address?.complement ?? "",
    district: address?.district ?? "",
    city: address?.city ?? "",
    state: address?.state ?? "",
    zipCode: address ? formatCep(address.zipCode) : "",
  };
}

const ADDRESS_KEYS = [
  "street",
  "number",
  "complement",
  "district",
  "city",
  "state",
  "zipCode",
] as const;

function hasAddressInput(draft: ICustomerDraft): boolean {
  return ADDRESS_KEYS.some((key) => draft[key].trim() !== "");
}

export function validateCustomerDraft(
  draft: ICustomerDraft,
  type: ICustomer["type"],
): ICustomerDraftErrors {
  const errors: ICustomerDraftErrors = {};
  if (type === "B2B") {
    if (!draft.razaoSocial.trim()) errors.razaoSocial = ERR.razaoSocialRequired;
    if (onlyDigits(draft.cnpj) && !isValidCnpj(draft.cnpj)) errors.cnpj = ERR.invalidCnpj;
  } else {
    if (!draft.fullName.trim()) errors.fullName = ERR.fullNameRequired;
    if (onlyDigits(draft.cpf) && !isValidCpf(draft.cpf)) errors.cpf = ERR.invalidCpf;
  }
  if (draft.email.trim() && !EMAIL_RE.test(draft.email.trim())) errors.email = ERR.invalidEmail;
  if (hasAddressInput(draft)) {
    if (!draft.street.trim()) errors.street = ERR.streetRequired;
    if (!draft.city.trim()) errors.city = ERR.cityRequired;
    if (!/^[A-Za-z]{2}$/.test(draft.state.trim())) errors.state = ERR.invalidState;
    if (draft.zipCode.trim() && onlyDigits(draft.zipCode).length !== 8) {
      errors.zipCode = ERR.invalidZip;
    }
  }
  return errors;
}

function buildAddress(draft: ICustomerDraft): ICustomerAddress | undefined {
  if (!hasAddressInput(draft)) return undefined;
  return {
    street: draft.street.trim(),
    number: draft.number.trim(),
    complement: draft.complement.trim() || undefined,
    district: draft.district.trim(),
    city: draft.city.trim(),
    state: draft.state.trim().toUpperCase(),
    zipCode: formatCep(draft.zipCode),
  };
}

function sameAddress(a: ICustomerAddress | undefined, b: ICustomerAddress | undefined): boolean {
  if (!a || !b) return !a && !b;
  // Coalesce both sides: imported JSONB addresses may lack keys at runtime
  // (value `undefined`) despite the string type, so a plain `===` would report
  // a false diff and trigger a spurious rewrite on open-and-save. UF is compared
  // case-insensitively for the same reason.
  const s = (v?: string) => (v ?? "").trim();
  return (
    s(a.street) === s(b.street) &&
    s(a.number) === s(b.number) &&
    s(a.complement) === s(b.complement) &&
    s(a.district) === s(b.district) &&
    s(a.city) === s(b.city) &&
    s(a.state).toUpperCase() === s(b.state).toUpperCase() &&
    onlyDigits(a.zipCode ?? "") === onlyDigits(b.zipCode ?? "")
  );
}

/**
 * Only the fields whose value actually changed vs the customer.
 *
 * Variant fields always ship together with `type` — `customerPatchToRow` only
 * maps them when the patch carries the discriminant. A cleared email/address is
 * emitted with the KEY PRESENT and an `undefined` value (the `"key" in patch`
 * contract with the supabase mapper, mirroring `buildLeadPatch`). Precondition:
 * run `validateCustomerDraft` first; as a defensive fallback an emptied
 * required display name is treated as "no change", never as a wipe.
 */
export function buildCustomerPatch(customer: ICustomer, draft: ICustomerDraft): Partial<ICustomer> {
  const patch: Record<string, unknown> = {};

  if (customer.type === "B2B") {
    const razaoSocial = draft.razaoSocial.trim();
    if (razaoSocial && razaoSocial !== customer.razaoSocial) patch.razaoSocial = razaoSocial;
    const nomeFantasia = draft.nomeFantasia.trim();
    if (nomeFantasia !== customer.nomeFantasia) patch.nomeFantasia = nomeFantasia;
    const contactName = draft.contactName.trim();
    if (contactName !== customer.contactName) patch.contactName = contactName;
    const cnpj = onlyDigits(draft.cnpj);
    if (cnpj !== onlyDigits(customer.cnpj)) patch.cnpj = cnpj;
  } else {
    const fullName = draft.fullName.trim();
    if (fullName && fullName !== customer.fullName) patch.fullName = fullName;
    const cpf = onlyDigits(draft.cpf);
    if (cpf !== onlyDigits(customer.cpf)) patch.cpf = cpf;
  }
  if (Object.keys(patch).length > 0) patch.type = customer.type;

  // Compare the normalized draft against the normalized current email so merely
  // opening the editor on a customer with a mixed-case stored email and saving
  // doesn't emit a no-op write. A genuine change still differs and is written
  // (lowercased); an emptied field still clears (`undefined`, key present).
  const email = draft.email.trim().toLowerCase() || undefined;
  if ((email ?? "") !== (customer.email?.toLowerCase() ?? "")) patch.email = email;

  const address = buildAddress(draft);
  if (!sameAddress(address, customer.address)) patch.address = address;

  return patch as Partial<ICustomer>;
}
