import type {
  ICustomer,
  ID,
  IPart,
  IPartIdentification,
  IPlatformSettings,
  IQuote,
  IQuoteItem,
  IShippingResult,
} from "@/shared/types";
import { calculateShipping } from "@/features/shipping/api/calculate";

export interface IGenerateSdrQuoteInput {
  identification: IPartIdentification;
  customer: ICustomer;
  /** Catalog snapshot — same source used by PRD-021 search. */
  parts: IPart[];
  settings: IPlatformSettings;
  /** Seller that owns the conversation; fallback to "sdr-agent" for orphan flows. */
  sellerId: ID;
  storeId: ID;
  now?: string;
}

export interface IGenerateSdrQuoteResult {
  quote: IQuote;
  shipping: IShippingResult;
  /** True when the catalog had no real match — caller decides what to do. */
  pricingUnavailable: boolean;
}

/**
 * Compose an `IQuote` (PRD-002) out of a confirmed identification. Pure — the
 * caller persists it via the provider and dispatches the message.
 *
 * Honours `settings.sdrAutoDiscountPct`, `settings.sdrQuoteValidityDays` and
 * `settings.shipping` (PRD-022 RF-005/006 + PRD-033 RF-006).
 */
export function generateSdrQuote(input: IGenerateSdrQuoteInput): IGenerateSdrQuoteResult {
  const now = input.now ?? new Date().toISOString();
  const partId = input.identification.customerConfirmedPartId;
  if (!partId) {
    throw new Error("generateSdrQuote: identification has no customerConfirmedPartId");
  }
  const part = input.parts.find((p) => p.id === partId);
  const candidate = input.identification.candidates.find((c) => c.partId === partId);
  const unitPrice = part?.unitPrice ?? candidate?.estimatedPrice;
  const pricingUnavailable = unitPrice == null;

  const safePrice = unitPrice ?? 0;
  const partName = part?.name ?? candidate?.partName ?? "Peça";
  const partSku = part?.sku ?? candidate?.oemCode ?? "—";

  const quantity = 1;
  const subtotal = round2(quantity * safePrice);
  const discountPct = Math.max(0, Math.min(1, input.settings.sdrAutoDiscountPct ?? 0));
  const discount = round2(subtotal * discountPct);
  const shipping = calculateShipping({
    address: input.customer.address,
    config: input.settings.shipping,
  });
  const shippingValue = shipping.isToNegotiate ? 0 : (shipping.value ?? 0);
  const total = round2(subtotal - discount + shippingValue);

  const validityDays = input.settings.sdrQuoteValidityDays ?? 7;
  const validUntil = addDaysIso(now, validityDays);

  const item: IQuoteItem = {
    id: `quote-item-${input.identification.id}-1`,
    partId,
    partSku,
    partName,
    quantity,
    unitPrice: safePrice,
    discount,
    total: round2(quantity * safePrice - discount),
  };

  const year = new Date(now).getUTCFullYear();
  const sdrSeq = Date.now().toString().slice(-4);
  const quote: IQuote = {
    id: `quote-sdr-${input.identification.id}-${Date.now()}`,
    storeId: input.storeId,
    number: `OR-${year}-S${sdrSeq}`,
    customerId: input.customer.id,
    sellerId: input.sellerId,
    items: [item],
    subtotal,
    discount,
    shipping: shippingValue,
    total,
    paymentCondition: "à combinar",
    validUntil,
    status: pricingUnavailable ? "rascunho" : "enviado",
    origin: "sdr",
    division: part?.division ?? "parts",
    createdAt: now,
    updatedAt: now,
    notes: shipping.isToNegotiate ? "Frete a combinar." : undefined,
  };

  return { quote, shipping, pricingUnavailable };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function addDaysIso(baseIso: string, days: number): string {
  const date = new Date(baseIso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}
