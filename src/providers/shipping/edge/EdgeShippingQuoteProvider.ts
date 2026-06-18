import { getSupabaseClient } from "@/shared/lib/supabase";
import type { IShippingQuoteOption } from "@/shared/types";
import type { IShippingQuoteProvider } from "../IShippingQuoteProvider";
import type { IShippingQuoteInput } from "../types";

interface QuoteResponse {
  options?: IShippingQuoteOption[];
  scaffold?: boolean;
  error?: string;
}

/**
 * Calls the `melhor-envio-quote` Edge Function (token resolved Vault-side).
 *
 * `{ scaffold: true }` (not connected) and a soft `{ options: [] }` both map to
 * an empty list, so the orchestrator (`useShippingQuote`) falls back to the
 * region rules. A hard invoke error propagates — the hook catches it and falls
 * back too, but keeps the error for logging.
 */
export class EdgeShippingQuoteProvider implements IShippingQuoteProvider {
  async quote(input: IShippingQuoteInput): Promise<IShippingQuoteOption[]> {
    const { data, error } = await getSupabaseClient().functions.invoke<QuoteResponse>(
      "melhor-envio-quote",
      { body: input },
    );
    if (error) throw error;
    if (!data || data.scaffold) return [];
    return Array.isArray(data.options) ? data.options : [];
  }
}
