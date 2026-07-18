// AUTO-GENERATED MIRROR — DO NOT EDIT.
// Source: src/providers/whatsapp/waha/eventKey.ts (sync: bun run scripts/sync-whatsapp-shared.ts)

/**
 * Idempotency key for WAHA webhook deliveries (waha-webhook/index.ts).
 *
 * WAHA assigns the SAME envelope `id` to the `message` and `message.any`
 * deliveries that report one underlying WhatsApp message (message.any is a
 * blanket mirror of every message, fromMe or not — genuine inbound reaches us
 * via both). The two arrive as separate, concurrent HTTP requests with no
 * ordering guarantee, so the key MUST be scoped by event type: an unscoped
 * key lets whichever delivery wins the isProcessed()/markProcessed() race
 * mark the OTHER type's key as processed too — silently dropping the
 * `message` delivery (the only one that persists the row) whenever
 * `message.any` happens to land first (confirmed live 2026-07-15: ~60-70ms
 * gaps between the two deliveries were enough to lose messages).
 *
 * Runtime-agnostic (no Deno-only imports) — mirrored into
 * supabase/functions/_shared/whatsapp/waha/ via scripts/sync-whatsapp-shared.ts.
 */
export function buildWahaEventKey(input: {
  accountId: string;
  event: string;
  envelopeId: string;
}): string {
  return `whatsapp:waha:${input.accountId}:${input.event}:${input.envelopeId}`;
}
