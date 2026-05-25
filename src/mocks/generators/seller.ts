import type { ISeller } from "@/shared/types";
import { SEED_SELLERS } from "../data";

/**
 * Sellers are seeded, not generated. This helper returns deep copies of the
 * canonical roster so the mock store mutates a fresh array without leaking
 * changes into the seed module.
 */
export function generateSellers(): ISeller[] {
  return SEED_SELLERS.map((seller) => ({ ...seller, divisions: [...seller.divisions] }));
}
