import type { ContactScope, ContactSource, IContact, ID } from "@/shared/types";
import { matchesScope } from "./contactScopes";

/** Sentinel for the "Sem responsável" option in the owner filter. */
export const UNASSIGNED_OWNER = "__none__";

export interface IContactFilterState {
  scope: ContactScope;
  search: string;
  /** Seller ids, or UNASSIGNED_OWNER for contacts with no owner. */
  owners: (ID | typeof UNASSIGNED_OWNER)[];
  tags: string[];
  /** "Cidade / UF" as shown in the select, or null for all. */
  city: string | null;
  sources: ContactSource[];
}

/** Lowercase and strip diacritics so "claudio" finds "Cláudio". */
function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/**
 * Whether a contact matches the search box.
 *
 * Phone matching is done twice: against the formatted string (so "99712-4488"
 * works) and against digits only (so a number pasted without formatting works).
 */
export function matchesSearch(contact: IContact, term: string): boolean {
  const query = term.trim();
  if (query === "") return true;

  const normalizedQuery = normalize(query);
  const haystack = [
    contact.name,
    contact.phone,
    contact.email,
    contact.customerName,
    contact.role,
    contact.city,
  ];
  if (haystack.some((field) => field && normalize(field).includes(normalizedQuery))) return true;

  const queryDigits = query.replace(/\D/g, "");
  if (queryDigits !== "" && contact.phoneDigits) {
    return contact.phoneDigits.includes(queryDigits);
  }
  return false;
}

/**
 * Client-side filter pipeline. Used by the mock provider and to refine an
 * already-paginated page — the Supabase provider does the same work in SQL.
 */
export function applyContactFilters(
  contacts: IContact[],
  filters: IContactFilterState,
): IContact[] {
  return contacts.filter((contact) => {
    if (!matchesScope(contact, filters.scope)) return false;

    if (filters.owners.length > 0) {
      const ownerKey = contact.ownerSellerId ?? UNASSIGNED_OWNER;
      if (!filters.owners.includes(ownerKey)) return false;
    }

    if (filters.tags.length > 0 && !filters.tags.some((tag) => contact.tags.includes(tag))) {
      return false;
    }

    if (filters.city !== null) {
      const label = contact.uf ? `${contact.city} / ${contact.uf}` : (contact.city ?? "");
      if (label !== filters.city) return false;
    }

    if (filters.sources.length > 0 && !filters.sources.includes(contact.source)) return false;

    return matchesSearch(contact, filters.search);
  });
}
