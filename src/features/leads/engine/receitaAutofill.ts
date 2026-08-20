import type { ICustomerAddress, ILead } from "@/shared/types";
import type {
  ICnpjCompany,
  ICnpjCompanyAddress,
} from "@/features/customers/utils/minhaReceitaMapper";
import type { CnpjLookupStatus } from "@/features/customers/hooks/useMinhaReceita";
import { isValidCnpj, onlyDigits } from "@/features/customers/utils/cnpjCpf";
import { conversionAddressLabel, isConversionName } from "./conversionReadiness";

/**
 * What a CNPJ lookup is allowed to write onto the lead behind it.
 *
 * The panel's document row is the one place in the product where the Receita's
 * answer arrives while the OTHER checklist rows are already on screen, half of
 * them possibly answered. So the rule the "Novo cliente" form applies field by
 * field ("only into what is still empty") is expressed here as a plan the row
 * can also SHOW before saving — the seller sees "e-mail e endereço serão
 * preenchidos junto" rather than watching three rows change on their own.
 *
 * The name is the deliberate exception: a lead almost always carries the
 * WhatsApp push name, which the checklist counts as answered, so the company
 * name is offered rather than applied. See {@link IReceitaAutofillPlan.nameSuggestion}.
 */

/** What the document row's lookup is doing, as the editor renders it. */
export type ReceitaLookupState =
  /** Not a complete, checksum-valid CNPJ — including every CPF. */
  | "idle"
  /** A lookup is in flight, or the debounce hasn't caught up with the field. */
  | "checking"
  /** The Receita answered for this exact CNPJ. */
  | "found"
  /** Valid CNPJ the Receita mirror doesn't know. Never blocks saving. */
  | "notfound"
  /** The mirror couldn't be reached. Never blocks saving. */
  | "offline";

export interface IReceitaLookupInput {
  /** What is in the field right now, masked or bare. */
  typed: string;
  /**
   * The CNPJ the current lookup was actually fired for, digits only — null
   * while nothing has been asked. NOT the debounced field value: those diverge
   * for the render between the debounce landing and the effect running.
   */
  requestedCnpj: string | null;
  status: CnpjLookupStatus;
  /** The CNPJ the loaded company belongs to, digits only. */
  loadedCnpj: string | null;
}

/**
 * Single source of truth for the document row's lookup state.
 *
 * The staleness rules are the entire point, and both have bitten this codebase
 * before (see `newCustomerLookup.deriveDocState` and the `cnpjPendingDebounce`
 * guard in `ConvertLeadModal`):
 *
 *  - until a lookup has been fired for the number ON SCREEN, every status on
 *    hand — success, 404 and network error alike — describes a DIFFERENT CNPJ.
 *    Gating on `requestedCnpj` rather than on the debounced value covers all
 *    three uniformly; gating on the debounce covered only the success;
 *  - a success additionally has to carry the company for that same CNPJ, or an
 *    answer that landed after the seller kept typing would be written onto the
 *    lead alongside a document it has nothing to do with.
 */
export function deriveReceitaLookupState({
  typed,
  requestedCnpj,
  status,
  loadedCnpj,
}: IReceitaLookupInput): ReceitaLookupState {
  const digits = onlyDigits(typed);
  if (digits.length !== 14 || !isValidCnpj(digits)) return "idle";
  if (requestedCnpj !== digits) return "checking";
  if (status === "invalid") return "notfound";
  if (status === "error") return "offline";
  if (status === "success" && loadedCnpj === digits) return "found";
  // "idle" is the instant between the request being registered and the fetch
  // starting; "loading" is the fetch itself. Both read as checking.
  return "checking";
}

export type ReceitaAutofillField = "name" | "email" | "address";

/** One row the plan fills, with the value the seller gets to read before saving. */
export interface IReceitaAutofillEntry {
  id: ReceitaAutofillField;
  /** Display-ready, and short enough for the popover. */
  value: string;
}

export interface IReceitaAutofillPlan {
  /**
   * Written ALONGSIDE the document, in the same save — one write, one audit
   * entry, one refetch. Never contains a field the lead already answered.
   */
  changes: Partial<ILead>;
  /** Which checklist rows the plan fills, in the checklist's own order. */
  fields: IReceitaAutofillEntry[];
  /**
   * The company name, offered when the lead ALREADY has a usable name — the
   * seller decides, because replacing a name somebody typed is not autofill.
   * Null when the name was empty (then it is in `changes`), when the Receita
   * gave none, or when it already matches what the lead carries.
   */
  nameSuggestion: string | null;
}

/**
 * The name the CRM would display: fantasia first, razão social as the fallback.
 * Mirrors what `NewCustomerModal` fills its name field with.
 */
export function receitaCompanyName(company: ICnpjCompany): string | null {
  return company.nomeFantasia?.trim() || company.razaoSocial?.trim() || null;
}

/**
 * The Receita's address, merged OVER whatever the lead already carries — never
 * a wholesale replacement.
 *
 * The checklist counts an address as answered on city/UF alone, so a record
 * holding only a street and a CEP reads as unanswered; replacing the object
 * would then throw away two fields somebody typed in order to fill in the rest.
 * Merging per subfield makes that class of loss impossible.
 */
export function mergeLeadAddress(
  current: ICustomerAddress | undefined,
  address: ICnpjCompanyAddress,
): ICustomerAddress {
  const keep = (mine: string | undefined, theirs: string) => mine?.trim() || theirs;
  const complement = current?.complement?.trim() || address.complement?.trim();
  return {
    street: keep(current?.street, address.street),
    number: keep(current?.number, address.number),
    ...(complement ? { complement } : {}),
    district: keep(current?.district, address.district),
    city: keep(current?.city, address.city),
    state: keep(current?.state, address.state),
    zipCode: keep(current?.zipCode, address.zipCode),
  };
}

/**
 * The open Receita dataset is dirty in this field — "NAOPOSSUI@NAOTEM" and
 * bare domains are common. The e-mail row of the same editor refuses those by
 * hand, so autofill must not walk them in through the side door: the value is
 * written blind, and the seller only sees it after it has been saved.
 */
function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

/** One line of address, short enough to read inside the popover. */
function addressPreview(address: ICustomerAddress): string {
  const city = [address.city, address.state].filter(Boolean).join("/");
  return [address.street, city].filter(Boolean).join(" · ") || city;
}

export function planReceitaAutofill(lead: ILead, company: ICnpjCompany): IReceitaAutofillPlan {
  const changes: Partial<ILead> = {};
  const fields: IReceitaAutofillEntry[] = [];
  const companyName = receitaCompanyName(company);
  let nameSuggestion: string | null = null;

  if (companyName) {
    if (!isConversionName(lead.name, lead.phone)) {
      changes.name = companyName;
      fields.push({ id: "name", value: companyName });
    } else if (lead.name.trim().toLowerCase() !== companyName.toLowerCase()) {
      nameSuggestion = companyName;
    }
  }

  const email = company.email?.trim();
  if (email && isPlausibleEmail(email) && !lead.email?.trim()) {
    changes.email = email;
    fields.push({ id: "email", value: email });
  }

  if (company.address && !conversionAddressLabel(lead)) {
    const address = mergeLeadAddress(lead.address, company.address);
    changes.address = address;
    fields.push({ id: "address", value: addressPreview(address) });
  }

  return { changes, fields, nameSuggestion };
}

/**
 * Everything the document row's save writes, in one object.
 *
 * Lives here rather than inline in the editor because it carries two invariants
 * worth a test:
 *
 *  - the document is what the row exists to write, so no plan — this one or a
 *    wider one later — may overwrite it;
 *  - it also has to come FIRST, because `LeadPanelBody.saveField` reads
 *    `Object.keys(changes)[0]` to decide which row spins and what the audit
 *    entry is called. A plan field landing in that slot would spin the wrong row.
 */
export function buildDocumentSaveChanges(
  digits: string,
  plan: IReceitaAutofillPlan | null,
  acceptNameSuggestion: boolean,
): Partial<ILead> {
  const { document: _ignored, ...fromPlan } = { ...(plan?.changes ?? {}) };
  const changes: Partial<ILead> = { document: digits, ...fromPlan };
  if (acceptNameSuggestion && plan?.nameSuggestion) changes.name = plan.nameSuggestion;
  return changes;
}
