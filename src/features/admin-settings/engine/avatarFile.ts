/**
 * Profile-photo validation and initials fallback.
 *
 * Pure — no DOM, no provider. The limit is deliberately stricter than the
 * bucket's own 5 MB ceiling so the user gets a clear message client-side
 * instead of a storage error.
 */

/** Accepted MIME types, matching the "JPG ou PNG" copy shown under the avatar. */
export const AVATAR_ACCEPTED_TYPES = ["image/jpeg", "image/png"] as const;

/** Value for the file input's `accept` attribute. */
export const AVATAR_ACCEPT_ATTRIBUTE = AVATAR_ACCEPTED_TYPES.join(",");

/** 2 MB — see `AVATAR_SIZE_LABEL` for the user-facing wording. */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;

export const AVATAR_SIZE_LABEL = "2 MB";

export type AvatarValidation = { ok: true } | { ok: false; error: string };

/** Checks a picked file against the accepted types and the size ceiling. */
export function validateAvatarFile(file: File): AvatarValidation {
  if (!(AVATAR_ACCEPTED_TYPES as readonly string[]).includes(file.type)) {
    return { ok: false, error: "A foto deve ser um arquivo JPG ou PNG." };
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return { ok: false, error: `A foto deve ter no máximo ${AVATAR_SIZE_LABEL}.` };
  }
  return { ok: true };
}

/**
 * Two-letter fallback shown when there is no photo: first letter of the first
 * and last name, or the first two letters of a single name.
 */
export function formatInitials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  const first = parts[0] ?? "";
  if (!first) return "?";
  if (parts.length === 1) return first.slice(0, 2).toUpperCase();
  const last = parts[parts.length - 1] ?? "";
  return `${first.slice(0, 1)}${last.slice(0, 1)}`.toUpperCase();
}
