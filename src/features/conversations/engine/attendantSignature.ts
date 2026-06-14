/**
 * Attendant signature for outbound WhatsApp messages. When a seller has a
 * configured "nome de exibição nos atendimentos", their name is prepended to
 * the message so the customer knows who is talking — rendered bold on WhatsApp
 * via the `*...*` markup: `*Edmilson:* Bom dia`.
 *
 * Kept DOM-free and side-effect-free so the prefixing rules stay unit-testable.
 */

/**
 * Structured-text marker payloads that must NEVER be signed — the conversation
 * render/dispatch pipeline keys on them sitting at the START of the body
 * (product cards, trackable links, HSM templates). Prefixing breaks parsing.
 */
const STRUCTURED_MARKERS = ["[template]", "[product]", "[produto]", "[link]"] as const;

/** Matches a leading `*Name:* ` signature already present on the text. */
const ALREADY_SIGNED = /^\*[^*\n]+:\*\s/;

/** Normalizes the configured name: drops `*` (would break bold markup) and trims. */
export function normalizeAttendantName(attendantName: string | null | undefined): string {
  return (attendantName ?? "").replace(/\*/g, "").trim();
}

/**
 * Prepend the attendant's signature to `text` as `*Name:* text`.
 *
 * Returns the text UNCHANGED when any of these holds (so it is safe to call on
 * every outbound path, including retries and schedule edits):
 *  - no usable name (empty / whitespace / only `*`);
 *  - blank text (media without caption — nothing to sign);
 *  - the body is a structured-marker payload (product / link / template);
 *  - the text is already signed (idempotent).
 */
export function applyAttendantSignature(
  text: string,
  attendantName: string | null | undefined,
): string {
  const name = normalizeAttendantName(attendantName);
  if (!name) return text;
  if (text.trim() === "") return text;
  if (STRUCTURED_MARKERS.some((marker) => text.startsWith(marker))) return text;
  if (ALREADY_SIGNED.test(text)) return text;
  return `*${name}:* ${text}`;
}
