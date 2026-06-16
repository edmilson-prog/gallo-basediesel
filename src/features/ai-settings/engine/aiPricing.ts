export interface IModelPricing {
  inputPricePer1kUsd: number;
  outputPricePer1kUsd: number;
}

/** Cost in BRL for a single call given token counts, model pricing and USD→BRL rate. */
export function costOfTokens(
  inputTokens: number,
  outputTokens: number,
  pricing: IModelPricing,
  usdToBrl: number,
): number {
  const usd =
    (inputTokens / 1000) * pricing.inputPricePer1kUsd +
    (outputTokens / 1000) * pricing.outputPricePer1kUsd;
  return usd * usdToBrl;
}
