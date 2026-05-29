import type { ISeller } from "@/shared/types";
import { SEED_STORE_ID } from "./seedStore";

/**
 * Fixed seller roster. The first five are internal staff; the sixth is an
 * external field rep. IDs are stable strings referenced across the mock
 * generators and a few feature pages, so they are kept unchanged even though
 * the display names now map to the real GALLO team — only `fullName`/`email`
 * move.
 *
 * `seller-joao-gallo` is the Owner (Fernando); `seller-marina-cardoso` is a
 * synthetic Gestor kept around so the role can be demoed.
 */
export const SEED_SELLERS: ISeller[] = [
  {
    id: "seller-joao-gallo",
    storeId: SEED_STORE_ID,
    fullName: "Fernando Mello Muniz Gallo",
    email: "fernando@gallobasediesel.com.br",
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
    fullName: "Lucas Costa",
    email: "lucas@gallobasediesel.com.br",
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
    email: "marina@gallobasediesel.com.br",
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
    fullName: "Cauan Bulegon",
    email: "caua@gallobasediesel.com.br",
    phone: "(55) 99800-0004",
    type: "internal",
    availability: "ocupado",
    divisions: ["parts"],
    active: true,
    createdAt: "2026-01-12T08:00:00.000Z",
  },
  {
    id: "seller-ramon-schimidt",
    storeId: SEED_STORE_ID,
    fullName: "Ramon Schimidt",
    email: "ramon@gallobasediesel.com.br",
    phone: "(55) 99800-0005",
    type: "internal",
    availability: "online",
    divisions: ["parts"],
    active: true,
    createdAt: "2026-01-15T08:00:00.000Z",
  },
  {
    id: "seller-welligton-nunes",
    storeId: SEED_STORE_ID,
    fullName: "Welligton Nunes",
    email: "welligton@gallobasediesel.com.br",
    phone: "(55) 99800-0006",
    type: "external",
    availability: "online",
    region: "Noroeste RS",
    commissionTier: "pleno",
    divisions: ["parts"],
    active: true,
    createdAt: "2026-01-18T08:00:00.000Z",
  },
];

export const SEED_SELLER_IDS: string[] = SEED_SELLERS.map((s) => s.id);

/** The owner is the seller whose role on `mock-users.ts` is `Owner`. */
export const SEED_OWNER_ID = "seller-joao-gallo";

/**
 * Sellers eligible to receive customer wallets (carteira 1:1).
 * The Owner (Fernando) and the synthetic Gestor (Marina) may hold customers,
 * but newcomers should always land on the vendedores roster below.
 */
export const SEED_VENDEDOR_SELLER_IDS: string[] = [
  "seller-carlos-santos",
  "seller-rafael-lima",
  "seller-ramon-schimidt",
  "seller-welligton-nunes",
];
