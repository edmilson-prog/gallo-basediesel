import type { ID } from "@/shared/types";

/** The only fields the invariant needs — keeps this engine free of the full IPixKey. */
export interface IDefaultKeyCandidate {
  id: ID;
  isDefault: boolean;
}

/**
 * Ids that must lose `isDefault` when `promotedId` becomes the store's default.
 *
 * Promoting a key that is already the default returns `[]` — demoting it would
 * leave the store with no default at all.
 *
 * This is best-effort on the client: it sees one render's worth of keys, so two
 * overlapping promotions can still leave two defaults behind. The partial unique
 * index on `pix_keys (store_id) where is_default` is what actually holds the
 * invariant; this function keeps the common path tidy and gives the UI something
 * to act on immediately.
 */
export function keysToDemote(keys: IDefaultKeyCandidate[], promotedId: ID): ID[] {
  return keys.filter((k) => k.isDefault && k.id !== promotedId).map((k) => k.id);
}
