import type { IContact } from "@/shared/types";

/** Reason stamped on the record that gets absorbed. */
export function mergeIgnoreReason(primaryName: string): string {
  return `Mesclado em “${primaryName}”`;
}

function isBlank(value: string | null | undefined): boolean {
  return value === null || value === undefined || value.trim() === "";
}

/**
 * What a merge writes onto the surviving contact.
 *
 * Strictly additive: a field is copied over only when the primary is missing
 * it. A merge exists to recover information that got split across two
 * records, not to let the duplicate's (usually staler) values win — so
 * nothing already filled in on the primary is ever touched, its `name`
 * included.
 *
 * Tags are unioned, and the customer link is filled only when the primary is
 * loose. Returns an empty patch when the duplicate adds nothing, which the
 * providers use to skip a pointless write.
 */
export function buildMergePatch(primary: IContact, duplicate: IContact): Partial<IContact> {
  const patch: Partial<IContact> = {};

  if (isBlank(primary.phone) && !isBlank(duplicate.phone)) patch.phone = duplicate.phone;
  if (isBlank(primary.email) && !isBlank(duplicate.email)) patch.email = duplicate.email;
  if (isBlank(primary.role) && !isBlank(duplicate.role)) patch.role = duplicate.role;
  if (isBlank(primary.city) && !isBlank(duplicate.city)) patch.city = duplicate.city;
  if (isBlank(primary.uf) && !isBlank(duplicate.uf)) patch.uf = duplicate.uf;
  if (primary.customerId === null && duplicate.customerId !== null) {
    patch.customerId = duplicate.customerId;
  }
  if (primary.ownerSellerId === null && duplicate.ownerSellerId !== null) {
    patch.ownerSellerId = duplicate.ownerSellerId;
  }
  if (primary.leadId === null && duplicate.leadId !== null) patch.leadId = duplicate.leadId;
  if (!primary.hasWhatsapp && duplicate.hasWhatsapp) patch.hasWhatsapp = true;

  // The most recent of the two — losing a real interaction date to a merge
  // would misfile the contact under "Último contato".
  const primaryLast = primary.lastContactAt ? Date.parse(primary.lastContactAt) : -Infinity;
  const duplicateLast = duplicate.lastContactAt ? Date.parse(duplicate.lastContactAt) : -Infinity;
  if (duplicateLast > primaryLast && duplicate.lastContactAt) {
    patch.lastContactAt = duplicate.lastContactAt;
  }

  const extraTags = duplicate.tags.filter((tag) => !primary.tags.includes(tag));
  if (extraTags.length > 0) patch.tags = [...primary.tags, ...extraTags];

  return patch;
}
