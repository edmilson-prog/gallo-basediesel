import type { IShippingQuoteOption } from "@/shared/types";
import type { IShippingQuoteInput } from "./types";

/**
 * Standalone shipping-quote provider (modelled on `src/providers/whatsapp/`,
 * intentionally NOT part of `providers/data`).
 *
 * Returns the RAW carrier options (no markup). The pure front engine
 * (`src/features/shipping/engine/quoteEngine.ts`) applies the markup, picks the
 * cheapest and applies free shipping afterwards.
 */
export interface IShippingQuoteProvider {
  quote(input: IShippingQuoteInput): Promise<IShippingQuoteOption[]>;
}
