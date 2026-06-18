/**
 * Public surface of the shipping-quote provider layer (Épico "Melhor Envio").
 *
 *   import { getShippingQuoteProvider } from "@/providers/shipping";
 *
 * Standalone by design — NOT registered in `providers/data` / `IDataProviders`.
 * @see ../../../docs/dev/melhor-envio-cotacao.md
 */

export type { IShippingQuoteProvider } from "./IShippingQuoteProvider";
export type { IShippingQuoteInput } from "./types";
export { getShippingQuoteProvider } from "./factory";
export { MockShippingQuoteProvider } from "./mock/MockShippingQuoteProvider";
export { EdgeShippingQuoteProvider } from "./edge/EdgeShippingQuoteProvider";
