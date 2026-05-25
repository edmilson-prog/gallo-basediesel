import type { ISeller } from "@/shared/types";
import { SEED_STORE_ID } from "./seedStore";

/**
 * Fixed seller roster. The first three correspond to authentication profiles
 * exposed by `src/features/auth/mock-users.ts`, so logging in as one of those
 * profiles always lands on a real-looking carteira; the fourth seller exists
 * only to give the BI dashboards enough heads to compare.
 *
 * IDs are stable strings (not UUIDs) so the auth layer and the bootstrap can
 * cross-reference them without coordination.
 */
export const SEED_SELLERS: ISeller[] = [
  {
    id: "seller-joao-gallo",
    storeId: SEED_STORE_ID,
    fullName: "João Gallo",
    email: "joao@gallo.com.br",
    phone: "(55) 99800-0001",
    type: "internal",
    availability: "online",
    divisions: ["parts"],
    active: true,
    createdAt: "2026-01-01T08:00:00.000Z",
  },
  {
    id: "seller-carlos-santos",
    storeId: SEED_STORE_ID,
    fullName: "Carlos Santos",
    email: "carlos@gallo.com.br",
    phone: "(55) 99800-0002",
    type: "internal",
    availability: "online",
    divisions: ["parts"],
    active: true,
    createdAt: "2026-01-05T08:00:00.000Z",
  },
  {
    id: "seller-marina-cardoso",
    storeId: SEED_STORE_ID,
    fullName: "Marina Cardoso",
    email: "marina@gallo.com.br",
    phone: "(55) 99800-0003",
    type: "internal",
    availability: "ausente",
    divisions: ["parts"],
    active: true,
    createdAt: "2026-01-10T08:00:00.000Z",
  },
  {
    id: "seller-rafael-lima",
    storeId: SEED_STORE_ID,
    fullName: "Rafael Lima",
    email: "rafael@gallo.com.br",
    phone: "(55) 99800-0004",
    type: "internal",
    availability: "ocupado",
    divisions: ["parts"],
    active: true,
    createdAt: "2026-01-12T08:00:00.000Z",
  },
];

export const SEED_SELLER_IDS: string[] = SEED_SELLERS.map((s) => s.id);

/** The owner is the seller whose role on `mock-users.ts` is `Owner`. */
export const SEED_OWNER_ID = "seller-joao-gallo";

/**
 * Sellers eligible to receive customer wallets (carteira 1:1).
 * Owners can hold customers but newcomer customers should land on internal
 * vendedores, never on the Owner.
 */
export const SEED_VENDEDOR_SELLER_IDS: string[] = [
  "seller-carlos-santos",
  "seller-marina-cardoso",
  "seller-rafael-lima",
];
