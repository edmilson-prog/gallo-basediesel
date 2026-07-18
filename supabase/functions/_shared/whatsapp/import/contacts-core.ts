// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/import/contacts-core.ts (sync: bun run scripts/sync-whatsapp-shared.ts)

/**
 * Contacts import core — enriches EXISTING `customers`/`leads` from an
 * Evolution Go contact list (Funnel Frente 3, approved rule b+). This
 * producer no longer creates any record: the phonebook only ever improves a
 * name that is already in the base and matches by phone; a number with no
 * matching customer or lead is skipped and counted — it never becomes a
 * `pending_review` customer ghost. (History imports are the ones that create
 * leads for unknown numbers, because they carry a real conversation; a bare
 * phonebook entry with zero messages does not.)
 *
 * Pure batch processor: the persistence ({@link IContactsImportDb}) is injected
 * so this module is fully unit-testable; the `whatsapp-import-contacts` Edge
 * Function wires the engine (fetchGoContacts) + a service_role adapter.
 *
 * Idempotent: re-running never double-enriches — once a name stops being a
 * placeholder, subsequent runs leave it untouched. A single contact's failure
 * is counted and skipped — the run never aborts. Runtime-agnostic file:
 * relative imports only, Web APIs only.
 */

import type { IGoContact } from "../evolution-go/contacts.ts";

export interface IContactsImportStats {
  /** Individual contacts received from the instance. */
  contactsFound: number;
  /** Existing customers whose name was a placeholder and got a better one. */
  customersEnriched: number;
  /** Existing leads whose name was a placeholder and got a better one. */
  leadsEnriched: number;
  /** Matched a customer or lead, but there was nothing to improve. */
  alreadyComplete: number;
  /** No customer or lead in the base for this phone — no record is created. */
  skippedUnknown: number;
  /** Contacts that failed to land (DB error) — never aborts the run. */
  failed: number;
}

export function emptyContactsImportStats(): IContactsImportStats {
  return {
    contactsFound: 0,
    customersEnriched: 0,
    leadsEnriched: 0,
    alreadyComplete: 0,
    skippedUnknown: 0,
    failed: 0,
  };
}

/** A stored name that is empty or purely phone-shaped (digits/punctuation) is
 *  a placeholder, never a real name — the phonebook is allowed to replace it.
 *  Mirror of PHONE_LIKE in scripts/funnel/migrate-orphans-to-leads.ts. */
const PHONE_LIKE = /^\+?[0-9()\s.-]+$/;

function isPlaceholderName(name: string | null | undefined): boolean {
  const trimmed = (name ?? "").trim();
  return trimmed === "" || PHONE_LIKE.test(trimmed);
}

/** Injected persistence surface — service_role adapter in the Edge Function. */
export interface IContactsImportDb {
  /** Tolerant BR phone match (9th-digit variance) — same rule the webhook/history import use. */
  findCustomerByPhone(storeId: string, phoneDigits: string): Promise<{ id: string; name: string | null } | null>;
  /** Tolerant BR phone match against an existing lead's phone_digits. */
  findLeadByPhone(storeId: string, phoneDigits: string): Promise<{ id: string; name: string | null } | null>;
  /** Enrich-only: replaces a placeholder name. Never creates a record. */
  enrichCustomerName(id: string, name: string): Promise<void>;
  /** Enrich-only: replaces a placeholder name. Never creates a record. */
  enrichLeadName(id: string, name: string): Promise<void>;
}

/**
 * Enrich existing customers/leads from a contact list. Unknown numbers (no
 * matching customer or lead) are skipped and counted — this producer never
 * creates a record.
 */
export async function processContactsImport(args: {
  storeId: string;
  contacts: IGoContact[];
  db: IContactsImportDb;
  warn?: (msg: string, fields?: Record<string, unknown>) => void;
}): Promise<IContactsImportStats> {
  const { storeId, contacts, db } = args;
  const warn = args.warn ?? (() => {});
  const stats = emptyContactsImportStats();
  stats.contactsFound = contacts.length;

  for (const contact of contacts) {
    const phoneDigits = contact.phone.replace(/\D/g, "");
    const rawCandidate = contact.name?.trim() || undefined;
    // The phonebook's own name can be just as placeholder-shaped as the
    // stored one (an unset WhatsApp profile echoes the phone number back) —
    // a candidate is only usable when it is itself a real name, never a
    // placeholder swapped for another placeholder.
    const candidateName = rawCandidate && !isPlaceholderName(rawCandidate) ? rawCandidate : undefined;
    try {
      const customer = await db.findCustomerByPhone(storeId, phoneDigits);
      if (customer) {
        if (candidateName && isPlaceholderName(customer.name)) {
          await db.enrichCustomerName(customer.id, candidateName);
          stats.customersEnriched++;
        } else {
          stats.alreadyComplete++;
        }
        continue;
      }
      const lead = await db.findLeadByPhone(storeId, phoneDigits);
      if (lead) {
        if (candidateName && isPlaceholderName(lead.name)) {
          await db.enrichLeadName(lead.id, candidateName);
          stats.leadsEnriched++;
        } else {
          stats.alreadyComplete++;
        }
        continue;
      }
      stats.skippedUnknown++;
    } catch (error) {
      stats.failed++;
      warn("contact import failed — skipping", {
        phone: contact.phone,
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }
  return stats;
}
