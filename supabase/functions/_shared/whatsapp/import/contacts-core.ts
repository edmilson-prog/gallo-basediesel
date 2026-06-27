// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/import/contacts-core.ts (sync: bun run scripts/sync-whatsapp-shared.ts)

/**
 * Contacts import core — lands an Evolution Go contact list as `customers`.
 *
 * Pure batch processor: the persistence ({@link IContactsImportDb}) is injected
 * so this module is fully unit-testable; the `whatsapp-import-contacts` Edge
 * Function wires the engine (fetchGoContacts) + a service_role adapter.
 *
 * Idempotent: a contact that already maps to a customer (by phone) is counted,
 * never duplicated. A single contact's failure is counted and skipped — the run
 * never aborts. Runtime-agnostic file: relative imports only, Web APIs only.
 */

import type { IGoContact } from "../evolution-go/contacts.ts";

export interface IContactsImportStats {
  /** Individual contacts received from the instance. */
  contactsFound: number;
  /** New customer rows created. */
  customersCreated: number;
  /** Contacts that already had a customer (matched by phone). */
  customersExisting: number;
  /** Contacts that failed to land (DB error) — never aborts the run. */
  failed: number;
}

export function emptyContactsImportStats(): IContactsImportStats {
  return { contactsFound: 0, customersCreated: 0, customersExisting: 0, failed: 0 };
}

/** Injected persistence surface — service_role adapter in the Edge Function. */
export interface IContactsImportDb {
  /** Same suffix-narrow + exact-digit match the webhook/history import use. */
  findCustomerByPhone(storeId: string, phoneDigits: string): Promise<{ id: string } | null>;
  resolveDefaultSellerId(storeId: string): Promise<string>;
  createPendingContact(input: {
    storeId: string;
    phone: string;
    name?: string;
    sellerId: string;
  }): Promise<{ id: string }>;
}

/**
 * Land a contact list as customers. New contacts become `pending_review`
 * customers owned by the store's default seller; already-known phones are
 * counted but untouched.
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

  // Resolve the default seller once, lazily on the first create — avoids the
  // "no active seller" throw when every contact already exists.
  let defaultSellerId: string | null = null;

  for (const contact of contacts) {
    const phoneDigits = contact.phone.replace(/\D/g, "");
    try {
      const existing = await db.findCustomerByPhone(storeId, phoneDigits);
      if (existing) {
        stats.customersExisting++;
        continue;
      }
      if (defaultSellerId === null) defaultSellerId = await db.resolveDefaultSellerId(storeId);
      await db.createPendingContact({
        storeId,
        phone: contact.phone,
        name: contact.name,
        sellerId: defaultSellerId,
      });
      stats.customersCreated++;
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
