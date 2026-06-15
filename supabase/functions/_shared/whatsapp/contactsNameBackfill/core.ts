// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/contactsNameBackfill/core.ts (sync: bun run scripts/sync-whatsapp-shared.ts)

/**
 * Pure matching core for the contact-name backfill.
 *
 * Customers auto-created by the webhook before it learned to read the contact's
 * pushName were named after their bare phone number. This core pairs the
 * Evolution instance's stored contacts (phone + WhatsApp profile name) with
 * those placeholder customers and decides which rows to rename — it NEVER
 * touches a customer whose name a human already typed (any name with a letter).
 *
 * No I/O: the Edge function fetches the contacts + customers and applies the
 * updates. Pure and runtime-agnostic (only Web APIs + relative imports) so it
 * mirrors into the Edge Functions tree via scripts/sync-whatsapp-shared.ts.
 */

/** A value carries a real name when it contains at least one letter (any script). */
export function hasLetter(value: string | undefined): boolean {
  return value !== undefined && /\p{L}/u.test(value);
}

/** Digits-only key for matching a phone across formats (E.164, masked, jid…). */
export function phoneKey(value: string | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

/** WhatsApp system jids (0@s.whatsapp.net, status broadcasts) collapse to a
 *  handful of digits — require a real-length number so they never match. */
const MIN_PHONE_DIGITS = 8;

export function isUsablePhone(value: string | undefined): boolean {
  return phoneKey(value).length >= MIN_PHONE_DIGITS;
}

/**
 * A customer name is a placeholder (safe to overwrite) when it has no letter:
 * empty, or a bare/formatted phone number. A human-entered name (with letters)
 * is never a placeholder.
 */
export function isPlaceholderName(fullName: string | undefined): boolean {
  return !hasLetter(fullName);
}

export interface IBackfillContact {
  /** Contact phone in any format (matched digits-only). */
  phone: string;
  /** WhatsApp profile name (pushName), when the instance has one. */
  name?: string;
}

export interface IBackfillCustomer {
  id: string;
  phone: string;
  fullName: string;
}

export interface IPlannedRename {
  customerId: string;
  phone: string;
  currentName: string;
  newName: string;
}

/**
 * Decides the rename set. Indexes contacts that DO have a real name by their
 * digits-only phone, then for each placeholder customer looks up that index and
 * queues a rename when a different real name is found. Contacts without a real
 * name, customers without a phone, and no-op renames are skipped. On duplicate
 * phones the last contact with a real name wins (rare in practice).
 */
export function planContactNameBackfill(
  contacts: IBackfillContact[],
  customers: IBackfillCustomer[],
): IPlannedRename[] {
  const nameByPhone = new Map<string, string>();
  for (const contact of contacts) {
    if (!hasLetter(contact.name)) continue;
    if (!isUsablePhone(contact.phone)) continue;
    nameByPhone.set(phoneKey(contact.phone), contact.name!.trim());
  }

  const renames: IPlannedRename[] = [];
  for (const customer of customers) {
    if (!isPlaceholderName(customer.fullName)) continue;
    if (!isUsablePhone(customer.phone)) continue;
    const newName = nameByPhone.get(phoneKey(customer.phone));
    if (!newName) continue;
    if (newName === customer.fullName.trim()) continue;
    renames.push({
      customerId: customer.id,
      phone: customer.phone,
      currentName: customer.fullName,
      newName,
    });
  }
  return renames;
}
