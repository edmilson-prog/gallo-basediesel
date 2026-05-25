import type { ICustomer, ID, ISeller, RoleName } from "@/shared/types";

/**
 * Stable id of the seeded matriz (PRD-004). Hardcoded here so the mock auth
 * layer doesn't have to reach into the private mock seed module — kept in
 * lockstep with `SEED_STORE_ID` in `src/mocks/data/seedStore.ts`.
 */
const MATRIZ_STORE_ID: ID = "store-matriz";

/**
 * Mock user profile available on the /auth/login screen.
 *
 * On the MVP there are exactly three profiles. Selecting one writes its `id`
 * to localStorage under `gallo-mock-user` and treats the user as logged in.
 *
 * The PRD-006 (RBAC) replaces the simple `role` field with a full permission
 * matrix; the PRD-100+ (Supabase Auth) replaces this whole module.
 */
export interface IMockUserProfile {
  id: ID;
  role: RoleName;
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
}

export const MOCK_USERS: IMockUserProfile[] = [
  {
    id: "mock-owner",
    role: "Owner",
    displayName: "João Gallo",
    storeLabel: "GALLO Matriz",
    avatarInitials: "JG",
    description: "Fundador e dono — vê e faz tudo na plataforma.",
    defaultRedirect: "/app/inicio",
    storeId: MATRIZ_STORE_ID,
    accessibleStoreIds: [MATRIZ_STORE_ID],
  },
  {
    id: "mock-vendedor",
    role: "Vendedor",
    displayName: "Carlos Santos",
    storeLabel: "GALLO Matriz",
    avatarInitials: "CS",
    description: "Vendedor interno — Central de Atendimento e carteira.",
    defaultRedirect: "/app/atendimento",
    storeId: MATRIZ_STORE_ID,
    accessibleStoreIds: [MATRIZ_STORE_ID],
  },
  {
    id: "mock-cliente",
    role: "Cliente",
    displayName: "Transportadora Aurora Ltda",
    storeLabel: "Cliente B2B",
    avatarInitials: "TA",
    description: "Cliente B2B — vitrine pública e portal.",
    defaultRedirect: "/loja",
    storeId: MATRIZ_STORE_ID,
  },
];

export const MOCK_USER_BY_ID = new Map(MOCK_USERS.map((u) => [u.id, u]));

export const LOCALSTORAGE_USER_KEY = "gallo-mock-user";
