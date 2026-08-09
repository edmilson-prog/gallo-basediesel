import type { ContactScope, IContact, IContactScopeCounts } from "@/shared/types";

/**
 * Whether a contact belongs to a scope chip.
 *
 * `vinculados` + `soltos` partition the base; `optout` cuts across both, so the
 * chip counts intentionally do not add up to `todos`.
 */
export function matchesScope(contact: IContact, scope: ContactScope): boolean {
  switch (scope) {
    case "vinculados":
      return contact.customerId !== null;
    case "soltos":
      return contact.customerId === null;
    case "optout":
      return contact.optOut;
    case "todos":
    default:
      return true;
  }
}

export function countScopes(contacts: IContact[]): IContactScopeCounts {
  const counts: IContactScopeCounts = { todos: 0, vinculados: 0, soltos: 0, optout: 0 };
  for (const contact of contacts) {
    counts.todos++;
    if (contact.customerId !== null) counts.vinculados++;
    else counts.soltos++;
    if (contact.optOut) counts.optout++;
  }
  return counts;
}
