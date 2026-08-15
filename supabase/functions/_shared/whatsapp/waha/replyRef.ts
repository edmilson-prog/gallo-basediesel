// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/waha/replyRef.ts (sync: bun run scripts/sync-whatsapp-shared.ts)

/**
 * Reply/quote id reconciliation.
 *
 * WAHA delivers the quoted message id RAW in the inbound payload — the bare
 * hash, e.g. `A55995F4894E267BE03B5F864110C5CB` — while
 * `messages.provider_message_id` stores the SERIALIZED id
 * (`{fromMe}_{chatJid}_{hash}`, e.g.
 * `false_176312836698119@lid_A5458535B99785B0084742B6E0DC759C`). Confirmed
 * against real `webhook_deliveries` payloads on 2026-08-10.
 *
 * Matching the two by equality finds NOTHING: every inbound quote would be
 * silently orphaned and the feature would look broken only to whoever compared
 * it against WhatsApp. The link is the suffix — and it must include the `_`
 * separator, otherwise a longer hash ending in the same characters matches the
 * wrong message.
 *
 * Runtime-agnostic (mirrored into `supabase/functions/_shared/whatsapp/`):
 * no imports, Web APIs only.
 */

/** Max characters of the quoted snippet persisted in `messages.reply_to`. */
export const QUOTED_TEXT_MAX = 240;

/** Whether a serialized provider id refers to the message WAHA quoted by raw id. */
export function matchesProviderMessageId(serializedId: string, rawId: string): boolean {
  if (!serializedId || !rawId) return false;
  return serializedId.endsWith(`_${rawId}`);
}

/**
 * Picks, among candidate rows fetched with a broad `like '%<rawId>'`, the one
 * that really is the quoted message. The SQL filter alone is not proof: `_` is
 * a single-character wildcard in LIKE, so the exact check happens here.
 */
export function pickReplyMatch<T extends { provider_message_id?: string | null }>(
  rows: T[],
  rawId: string,
): T | undefined {
  return rows.find((row) => matchesProviderMessageId(String(row.provider_message_id ?? ""), rawId));
}

/**
 * Snippet stored in the quote. Cut at a word boundary so the preview never ends
 * mid-word; returns undefined for anything with no readable content, so callers
 * can omit the field instead of storing an empty string.
 */
export function truncateQuotedText(text: string | null | undefined): string | undefined {
  const trimmed = text?.trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= QUOTED_TEXT_MAX) return trimmed;
  const hard = trimmed.slice(0, QUOTED_TEXT_MAX);
  const lastSpace = hard.lastIndexOf(" ");
  // Only honor the word boundary when it isn't so early that it would gut the
  // snippet (a single very long token has no usable boundary).
  const cut = lastSpace > QUOTED_TEXT_MAX * 0.6 ? hard.slice(0, lastSpace) : hard;
  return `${cut.trimEnd()}…`;
}
