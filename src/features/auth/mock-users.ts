import type { ICustomer, ID, ISeller, RoleName } from "@/shared/types";

/**
 * Stable id of the seeded matriz (PRD-004). Hardcoded here so the mock auth
 * layer doesn't have to reach into the private mock seed module — kept in
 * lockstep with `SEED_STORE_ID` in `src/mocks/data/seedStore.ts`.
 */
const MATRIZ_STORE_ID: ID = "00000000-0000-0000-0000-000000000001";

/**
 * Mock user profile available on the /auth/login screen.
 *
 * On the MVP there are eight profiles: the GALLO team (Owner, Gestor, three
 * Vendedores, one VendedorExterno), a synthetic B2B Cliente, and a discreet
 * AILA admin. Selecting one writes its `id` to localStorage under
 * `gallo-mock-user` and treats the user as logged in.
 *
 * The PRD-006 (RBAC) replaces the simple `role` field with a full permission
 * matrix; the PRD-100+ (Supabase Auth) replaces this whole module.
 */
export interface IMockUserProfile {
  id: ID;
  role: RoleName;
  /**
   * Optional display-only label that overrides `role` on the login card.
   * Used for profiles whose RBAC role doesn't match their shown title — e.g.
   * the AILA admin runs with `Owner` permissions but is labeled "Admin · AILA".
   */
  displayRole?: string;
  /** Visual grouping on the login screen. */
  group: "team" | "client" | "admin";
  /** Email used by the hybrid login form to match the profile. */
  email: string;
  displayName: string;
  storeLabel: string;
  avatarInitials: string;
  description: string;
  /** Route to send the user to right after sign-in. */
  defaultRedirect: string;
  /**
   * Primary store of the user (PRD-007).
   *
   * Drives the initial value of `useCurrentStore()` when localStorage has no
   * persisted choice. Customers (B2C/B2B browsing the public storefront) do
   * not have an active store and may keep this empty — the StoreSwitcher is
   * hidden on the public Loja layout anyway.
   */
  storeId: ID;
  /**
   * Stores the user can switch into via the StoreSwitcher (PRD-007).
   *
   * On the MVP every staff profile has only the matriz; future filials and
   * parceiras will extend this list. Owner-like profiles may carry the full
   * roster so `useAccessibleStores` returns every store.
   */
  accessibleStoreIds?: ID[];
  /** Optional underlying domain entity (seller for staff, customer for B2B). */
  entity?: Partial<ISeller> | Partial<ICustomer>;
  /**
   * For staff profiles, the underlying ISeller.id (PRD-013).
   *
   * The mock auth layer keeps the profile id distinct from the seller id so
   * the user-switcher UX stays decoupled from the seeded roster. Features
   * that need the actual seller (e.g. availability toggle) use this field.
   */
  sellerId?: ID;
}

/**
 * Auth-source-agnostic user profile. Today it is structurally the mock profile;
 * the Supabase backend (PRD-107) builds the same shape from the `profiles`
 * table so `IAuthContextValue.currentUser` stays identical across backends.
 */
export type IUserProfile = IMockUserProfile;

export const MOCK_USERS: IMockUserProfile[] = [
  {
    id: "mock-owner",
    role: "Owner",
    group: "team",
    email: "fernando@gallobasediesel.com.br",
    displayName: "Fernando Mello Muniz Gallo",
    storeLabel: "GALLO Matriz",
    avatarInitials: "FG",
    description: "CEO e fundador — visão completa da operação.",
    defaultRedirect: "/app/inicio",
    storeId: MATRIZ_STORE_ID,
    accessibleStoreIds: [MATRIZ_STORE_ID],
    sellerId: "seller-joao-gallo",
  },
  {
    id: "mock-gestor",
    role: "Gestor",
    group: "team",
    email: "marina@gallobasediesel.com.br",
    displayName: "Marina Cardoso",
    storeLabel: "GALLO Matriz",
    avatarInitials: "MC",
    description: "Gestora da loja — equipe, carteira e operação diária.",
    defaultRedirect: "/app/inicio",
    storeId: MATRIZ_STORE_ID,
    accessibleStoreIds: [MATRIZ_STORE_ID],
    sellerId: "seller-marina-cardoso",
  },
  {
    id: "mock-vendedor-lucas",
    role: "Vendedor",
    group: "team",
    email: "lucas@gallobasediesel.com.br",
    displayName: "Lucas Costa",
    storeLabel: "GALLO Matriz",
    avatarInitials: "LC",
    description: "Vendedor interno — Central de Atendimento e carteira.",
    defaultRedirect: "/app/atendimento",
    storeId: MATRIZ_STORE_ID,
    accessibleStoreIds: [MATRIZ_STORE_ID],
    sellerId: "seller-carlos-santos", // legacy stable id — maps to Lucas Costa in seedSellers.ts
  },
  {
    id: "mock-vendedor-cauan",
    role: "Vendedor",
    group: "team",
    email: "caua@gallobasediesel.com.br",
    displayName: "Cauan Bulegon",
    storeLabel: "GALLO Matriz",
    avatarInitials: "CB",
    description: "Vendedor interno — Central de Atendimento e carteira.",
    defaultRedirect: "/app/atendimento",
    storeId: MATRIZ_STORE_ID,
    accessibleStoreIds: [MATRIZ_STORE_ID],
    sellerId: "seller-rafael-lima", // legacy stable id — maps to Cauan Bulegon in seedSellers.ts
  },
  {
    id: "mock-vendedor-ramon",
    role: "Vendedor",
    group: "team",
    email: "ramon@gallobasediesel.com.br",
    displayName: "Ramon Schimidt",
    storeLabel: "GALLO Matriz",
    avatarInitials: "RS",
    description: "Vendedor interno — Central de Atendimento e carteira.",
    defaultRedirect: "/app/atendimento",
    storeId: MATRIZ_STORE_ID,
    accessibleStoreIds: [MATRIZ_STORE_ID],
    sellerId: "seller-ramon-schimidt",
  },
  {
    id: "mock-vendedor-externo",
    role: "VendedorExterno",
    group: "team",
    email: "welligton@gallobasediesel.com.br",
    displayName: "Welligton Nunes",
    storeLabel: "GALLO Matriz",
    avatarInitials: "WN",
    description: "Vendedor externo — campo e carteira regional.",
    defaultRedirect: "/app/atendimento",
    storeId: MATRIZ_STORE_ID,
    accessibleStoreIds: [MATRIZ_STORE_ID],
    sellerId: "seller-welligton-nunes",
  },
  {
    id: "mock-cliente",
    role: "Cliente",
    group: "client",
    email: "aurora@cliente.com.br",
    displayName: "Transportadora Aurora Ltda",
    storeLabel: "Cliente B2B",
    avatarInitials: "TA",
    description: "Cliente B2B — vitrine pública e portal.",
    defaultRedirect: "/loja",
    storeId: MATRIZ_STORE_ID,
  },
  {
    id: "mock-admin-aila",
    role: "Owner",
    group: "admin",
    displayRole: "Admin · AILA",
    email: "admin@ailainteligente.com",
    displayName: "Edmilson Souza",
    storeLabel: "AILA · Suporte",
    avatarInitials: "ES",
    description: "Suporte AILA — acesso técnico total à plataforma.",
    defaultRedirect: "/app/inicio",
    storeId: MATRIZ_STORE_ID,
    accessibleStoreIds: [MATRIZ_STORE_ID],
  },
];

export const MOCK_USER_BY_ID = new Map(MOCK_USERS.map((u) => [u.id, u]));

export const LOCALSTORAGE_USER_KEY = "gallo-mock-user";

/** Finds a profile whose email matches (case-insensitive, trimmed). */
export function findMockUserByEmail(email: string): IMockUserProfile | undefined {
  const normalized = email.trim().toLowerCase();
  return MOCK_USERS.find((u) => u.email.trim().toLowerCase() === normalized);
}
