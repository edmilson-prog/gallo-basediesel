import type { ContactScope, IContact, IContactScopeCounts } from "@/shared/types";

/**
 * Whether a contact belongs to a scope chip.
 *
 * `vinculados` + `soltos` partition the base; `optout` cuts across both, so the
 * chip counts intentionally do not add up to `todos`.
 *
 * Triaged-away contacts (`ignoredAt !== null`) are excluded from EVERY scope
 * but `ignorados`, which exists to review them. That asymmetry is the whole
 * point: ignoring a contact has to remove it from the Agenda, and a listing
 * path that forgot to filter it would put it right back.
 *
 * The `switch` is exhaustive on purpose. It used to end in `default: return
 * true`, which was fail-open — a scope added later (this one) would have
 * matched every contact and shown the whole base under a filter meant to
 * narrow it. The `never` binding makes that a compile error instead.
 */
export function matchesScope(contact: IContact, scope: ContactScope): boolean {
  // Truthiness, not `!== null`, on purpose: a contact whose `ignoredAt` is
  // missing entirely (an older serialized row, a hand-built fixture) must
  // stay VISIBLE. Erring the other way would hide records from the Agenda
  // over a field nobody set.
  const isIgnored = Boolean(contact.ignoredAt);
  if (scope === "ignorados") return isIgnored;
  if (isIgnored) return false;

  switch (scope) {
    case "vinculados":
      return contact.customerId !== null;
    case "soltos":
      return contact.customerId === null;
    case "optout":
      return contact.optOut;
    case "todos":
      return true;
  }

  const exhaustive: never = scope;
  return exhaustive;
}

/**
 * Chip counts. Ignored contacts are left out of all four — they are not part
 * of the Agenda any more, so counting them would make the chips disagree with
 * the list they sit above.
 */
export function countScopes(contacts: IContact[]): IContactScopeCounts {
  const counts: IContactScopeCounts = { todos: 0, vinculados: 0, soltos: 0, optout: 0 };
  for (const contact of contacts) {
    if (contact.ignoredAt) continue;
    counts.todos++;
    if (contact.customerId !== null) counts.vinculados++;
    else counts.soltos++;
    if (contact.optOut) counts.optout++;
  }
  return counts;
}
