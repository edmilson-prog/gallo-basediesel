import type { IShippingQuoteOption } from "@/shared/types";
import type { IShippingQuoteProvider } from "../IShippingQuoteProvider";
import type { IShippingQuoteInput } from "../types";

/** Service catalog the mock returns (sandbox-plausible: Correios + Jadlog). */
interface MockService {
  serviceId: number;
  serviceName: string;
  companyId: number;
  companyName: string;
  /** Base price in BRL. */
  fixed: number;
  /** Per-kilogram surcharge in BRL. */
  perKg: number;
  /** Pseudo-random spread amount in BRL (varies the price per CEP). */
  spread: number;
  deliveryDays: number;
}

const SERVICES: MockService[] = [
  { serviceId: 1, serviceName: "PAC", companyId: 1, companyName: "Correios", fixed: 22, perKg: 2.5, spread: 18, deliveryDays: 8 },
  { serviceId: 2, serviceName: "SEDEX", companyId: 1, companyName: "Correios", fixed: 38, perKg: 3.6, spread: 26, deliveryDays: 3 },
  { serviceId: 3, serviceName: ".Package", companyId: 3, companyName: "Jadlog", fixed: 28, perKg: 2.9, spread: 22, deliveryDays: 5 },
];

/** Deterministic FNV-1a hash of the route + weight — same input ⇒ same seed. */
function seedFrom(input: IShippingQuoteInput): number {
  const raw = `${input.originZip.replace(/\D/g, "")}|${input.destZip.replace(/\D/g, "")}|${Math.round(input.weightKg * 10)}`;
  let hash = 2166136261;
  for (let i = 0; i < raw.length; i += 1) {
    hash ^= raw.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Deterministic, network-free quote provider used when the data source is
 * `mock` (demo + tests). Prices vary by CEP + weight but are stable across
 * reloads. `finalPrice` equals `basePrice` — the engine applies the markup.
 */
export class MockShippingQuoteProvider implements IShippingQuoteProvider {
  quote(input: IShippingQuoteInput): Promise<IShippingQuoteOption[]> {
    const seed = seedFrom(input);
    const allow = input.services && input.services.length > 0 ? new Set(input.services) : null;
    const weight = Math.max(0.1, input.weightKg);

    const options = SERVICES.filter((svc) => !allow || allow.has(svc.serviceId)).map<IShippingQuoteOption>(
      (svc, idx) => {
        const jitter = ((seed >>> (idx * 5)) % 1000) / 1000; // 0..0.999, deterministic
        const basePrice = round2(svc.fixed + svc.perKg * weight + jitter * svc.spread);
        return {
          serviceId: svc.serviceId,
          serviceName: svc.serviceName,
          companyId: svc.companyId,
          companyName: svc.companyName,
          basePrice,
          finalPrice: basePrice,
          deliveryDays: svc.deliveryDays,
          deliveryRange: { min: svc.deliveryDays, max: svc.deliveryDays + 1 },
        };
      },
    );
    return Promise.resolve(options);
  }
}
