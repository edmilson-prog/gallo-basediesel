/**
 * Shipping-quote provider factory (Épico "Melhor Envio" · Fase A).
 *
 * Mirrors the WhatsApp factory's source resolution: the mock engine runs when
 * `VITE_SHIPPING_PROVIDER=mock` or the active data source is `mock` (the build
 * default), so demo/tests never touch the network. Otherwise the Edge engine
 * calls `melhor-envio-quote`. Providers are stateless — no caching needed.
 */

import { getActiveDataSource } from "@/providers/data";
import type { IShippingQuoteProvider } from "./IShippingQuoteProvider";
import { EdgeShippingQuoteProvider } from "./edge/EdgeShippingQuoteProvider";
import { MockShippingQuoteProvider } from "./mock/MockShippingQuoteProvider";

function isMockEngine(): boolean {
  return import.meta.env.VITE_SHIPPING_PROVIDER === "mock" || getActiveDataSource() === "mock";
}

export function getShippingQuoteProvider(): IShippingQuoteProvider {
  return isMockEngine() ? new MockShippingQuoteProvider() : new EdgeShippingQuoteProvider();
}
