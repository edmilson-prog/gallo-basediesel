import type { ID, IWhatsAppAccount } from "@/shared/types";

/**
 * Subset of `accounts` whose id is in `accessibleIds`.
 *
 * `accessibleIds === null` means the accessible set is still loading — return
 * `[]` so the instance filter never shows unauthorized instances, not even for
 * a frame. The caller keeps the full `accounts` list elsewhere (e.g. to resolve
 * the origin label/color of wallet conversations from instances the user cannot
 * staff). This is a UX gate, not a security boundary: conversation access itself
 * is enforced in the database (`can_access_conversation`).
 */
export function selectAccessibleAccounts(
  accounts: IWhatsAppAccount[],
  accessibleIds: Set<ID> | null,
): IWhatsAppAccount[] {
  if (accessibleIds === null) return [];
  return accounts.filter((a) => accessibleIds.has(a.id));
}
