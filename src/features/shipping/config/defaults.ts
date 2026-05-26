import type { IShippingConfig } from "@/shared/types";

/**
 * Default shipping configuration shipped to every store (PRD-033 RF-003).
 *
 * Three baseline rules cover the typical GALLO BASE DIESEL coverage area:
 *  - Frederico Westphalen city: R$ 50
 *  - Rest of RS: R$ 80
 *  - SC and PR: R$ 120
 * Anywhere else falls back to "a combinar" (conservative default).
 */
export const DEFAULT_SHIPPING_CONFIG: IShippingConfig = {
  strategy: "fixed_by_region",
  rates: [
    {
      id: "shipping-rate-fw",
      name: "Frederico Westphalen",
      scope: "city",
      cities: ["Frederico Westphalen"],
      baseValue: 50,
      isActive: true,
    },
    {
      id: "shipping-rate-rs",
      name: "Rio Grande do Sul",
      scope: "state",
      states: ["RS"],
      baseValue: 80,
      isActive: true,
    },
    {
      id: "shipping-rate-sc-pr",
      name: "SC + PR",
      scope: "states",
      states: ["SC", "PR"],
      baseValue: 120,
      isActive: true,
    },
  ],
  defaultWhenNoMatch: "to_negotiate",
};
