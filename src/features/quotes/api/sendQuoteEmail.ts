// src/features/quotes/api/sendQuoteEmail.ts
import type { ID } from "@/shared/types";
import { getSupabaseClient } from "@/shared/lib/supabase";

export interface ISendQuoteEmailResult {
  sent: boolean;
  to?: string;
  /** `missing_key` when the store has not configured Resend yet. */
  reason?: string;
  note?: string;
}

/**
 * Mails a saved quote to the customer through the `quote-send-email` Edge
 * Function. The body is built server-side from the persisted row — this call
 * only names the quote and, optionally, an address other than the customer's.
 *
 * Resolves with `sent: false` when the integration is off; only network and
 * authorization failures reject.
 */
export async function sendQuoteEmail(quoteId: ID, to?: string): Promise<ISendQuoteEmailResult> {
  const { data, error } = await getSupabaseClient().functions.invoke<ISendQuoteEmailResult>(
    "quote-send-email",
    { body: { quoteId, ...(to ? { to } : {}) } },
  );
  if (error) {
    let detail: { error?: string } = {};
    try {
      detail = await (error as { context?: Response }).context?.json();
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    throw new Error(detail.error ?? "Falha ao enviar o orçamento por e-mail.");
  }
  return data ?? { sent: false };
}
