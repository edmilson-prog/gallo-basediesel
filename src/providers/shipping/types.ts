/** Input contract for a real-time shipping quote (Épico "Melhor Envio" · Fase A). */
export interface IShippingQuoteInput {
  /** Origin CEP (store). 8 digits; the Edge strips non-digits. */
  originZip: string;
  /** Destination CEP (customer). 8 digits. */
  destZip: string;
  /** Aggregated outer box (centimetres). */
  box: { heightCm: number; widthCm: number; lengthCm: number };
  /** Summed item weight (kilograms). */
  weightKg: number;
  /** Declared value for insurance (order subtotal, BRL). */
  declaredValue: number;
  /** Selects the API base + OAuth app. */
  environment: "sandbox" | "production";
  /** Allowed service IDs (PAC=1, SEDEX=2, …). Empty/undefined = all. */
  services?: number[];
}
