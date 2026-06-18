export { calculateShipping } from "./api/calculate";
export type { ICalculateShippingInput, IShippingItemInput } from "./api/calculate";
export { DEFAULT_SHIPPING_CONFIG, DEFAULT_MELHOR_ENVIO_CONFIG } from "./config/defaults";
export {
  applyMarkup,
  applyFreeShipping,
  selectCheapest,
  buildQuoteResult,
} from "./engine/quoteEngine";
export { ShippingConfigPage } from "./pages/ShippingConfigPage";
