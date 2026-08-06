/** A name made only of digits and phone punctuation is a number, not a name. */
const PHONE_LIKE = /^\+?[0-9\s.\-+]+$/;

/** Portuguese connectors and articles that don't carry identity. */
const CONNECTORS = new Set(["de", "da", "do", "dos", "das", "e"]);

/**
 * Avatar initials for a contact.
 *
 * A bare phone number has no initials — the kit renders "#" for it, which is
 * how an unnamed WhatsApp profile shows up in the grid.
 */
export function contactInitials(name: string): string {
  const clean = name.replace(/[()]/g, "").trim();
  if (clean === "") return "#";
  if (PHONE_LIKE.test(clean)) return "#";

  // Skip Portuguese connectors and articles; keep all other words including short names.
  const parts = clean.split(/\s+/).filter((part) => !CONNECTORS.has(part.toLowerCase()));
  const initials = `${parts[0]?.[0] ?? ""}${parts[1]?.[0] ?? ""}`.toUpperCase();
  return initials !== "" ? initials : clean[0]!.toUpperCase();
}
