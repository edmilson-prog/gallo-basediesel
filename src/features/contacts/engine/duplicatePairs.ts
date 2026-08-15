import type { ID } from "@/shared/types";
import { normalizeEmail, phoneKeyOf } from "./triageMatch";

/**
 * The subset of a contact this detector needs.
 *
 * `IContact` satisfies it structurally, so the mock provider passes contacts
 * straight through; the Supabase provider reads only these columns (no
 * customer/owner embeds) to sweep the whole table cheaply, then hydrates the
 * handful of contacts that end up in a pair.
 */
export interface IDuplicateInput {
  id: ID;
  name: string;
  phone: string | null;
  email: string | null;
  role: string | null;
  city: string | null;
  customerId: ID | null;
  lastContactAt: string | null;
  createdAt: string;
}

export interface IDuplicatePairIds {
  /** Stable across runs: the two ids, sorted. */
  id: string;
  reason: string;
  /** The record triage proposes keeping. */
  primaryId: ID;
  /** The record that would be absorbed. */
  duplicateId: ID;
}

export const DUPLICATE_REASON_NINTH_DIGIT = "Mesmo número — variação de 9º dígito";
export const DUPLICATE_REASON_SAME_PHONE = "Mesmo número em dois contatos";
export const DUPLICATE_REASON_SAME_EMAIL = "Mesmo e-mail em dois contatos";

function filledFields(contact: IDuplicateInput): number {
  return [contact.phone, contact.email, contact.role, contact.city].filter(
    (value) => value !== null && value !== "",
  ).length;
}

/**
 * Which of two records should survive a merge.
 *
 * Linked beats loose first of all — the linked record is the one carrying a
 * customer, a carteira and a history. Everything after that breaks ties in
 * favour of the fuller, more recently used, older record, ending on the id so
 * the answer never depends on the order rows came back in.
 */
function isBetterPrimary(a: IDuplicateInput, b: IDuplicateInput): boolean {
  const aLinked = a.customerId !== null;
  const bLinked = b.customerId !== null;
  if (aLinked !== bLinked) return aLinked;

  const aFilled = filledFields(a);
  const bFilled = filledFields(b);
  if (aFilled !== bFilled) return aFilled > bFilled;

  const aLast = a.lastContactAt ? Date.parse(a.lastContactAt) : -Infinity;
  const bLast = b.lastContactAt ? Date.parse(b.lastContactAt) : -Infinity;
  if (aLast !== bLast) return aLast > bLast;

  const aCreated = Date.parse(a.createdAt);
  const bCreated = Date.parse(b.createdAt);
  if (aCreated !== bCreated) return aCreated < bCreated;

  return a.id < b.id;
}

function pairKey(a: ID, b: ID): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function groupBy(
  contacts: IDuplicateInput[],
  keyOf: (contact: IDuplicateInput) => string | null,
): Map<string, IDuplicateInput[]> {
  const groups = new Map<string, IDuplicateInput[]>();
  for (const contact of contacts) {
    const key = keyOf(contact);
    if (!key) continue;
    const bucket = groups.get(key);
    if (bucket) bucket.push(contact);
    else groups.set(key, [contact]);
  }
  return groups;
}

/**
 * Emits `primary × others` rather than every combination.
 *
 * A group of N same-number contacts has N·(N-1)/2 combinations but only N-1
 * decisions worth making: merge each stray into the one record that should
 * survive. Fanning out the full cross product would ask the same question
 * several times with different wording.
 */
function pairsFromGroup(
  group: IDuplicateInput[],
  reasonOf: (primary: IDuplicateInput, other: IDuplicateInput) => string,
): IDuplicatePairIds[] {
  const [first, ...others] = group;
  if (!first || others.length === 0) return [];
  let primary = first;
  for (const contact of others) {
    if (isBetterPrimary(contact, primary)) primary = contact;
  }
  return group
    .filter((contact) => contact.id !== primary.id)
    .map((contact) => ({
      id: pairKey(primary.id, contact.id),
      reason: reasonOf(primary, contact),
      primaryId: primary.id,
      duplicateId: contact.id,
    }));
}

/**
 * Contacts that look like the same person.
 *
 * Two rules, both drawn from how this base actually accumulated duplicates:
 * the same line stored with and without the 9th mobile digit (the WhatsApp
 * JID keeps it, the ERP import does not), and the same address landing on two
 * records. Phone wins over e-mail when a pair raises both, since sharing a
 * line is the stronger claim.
 *
 * Pure and order-independent: the same input set always yields the same pairs,
 * with the same primary, whatever order the rows arrive in.
 */
export function buildDuplicatePairs(contacts: IDuplicateInput[]): IDuplicatePairIds[] {
  const byPhone = groupBy(contacts, (contact) => phoneKeyOf(contact.phone));
  const byEmail = groupBy(contacts, (contact) => normalizeEmail(contact.email));

  const seen = new Set<string>();
  const pairs: IDuplicatePairIds[] = [];

  for (const group of byPhone.values()) {
    for (const pair of pairsFromGroup(group, (primary, other) => {
      const sameDigits =
        (primary.phone ?? "").replace(/\D/g, "") === (other.phone ?? "").replace(/\D/g, "");
      return sameDigits ? DUPLICATE_REASON_SAME_PHONE : DUPLICATE_REASON_NINTH_DIGIT;
    })) {
      if (seen.has(pair.id)) continue;
      seen.add(pair.id);
      pairs.push(pair);
    }
  }

  for (const group of byEmail.values()) {
    for (const pair of pairsFromGroup(group, () => DUPLICATE_REASON_SAME_EMAIL)) {
      if (seen.has(pair.id)) continue;
      seen.add(pair.id);
      pairs.push(pair);
    }
  }

  return pairs.sort((a, b) => a.id.localeCompare(b.id));
}
