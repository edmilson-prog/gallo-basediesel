import type { ICustomer, ID, ISeller, RoleName } from "@/shared/types";

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
  },
  {
    id: "mock-vendedor",
    role: "Vendedor",
    displayName: "Carlos Santos",
    storeLabel: "GALLO Matriz",
    avatarInitials: "CS",
    description: "Vendedor interno — Central de Atendimento e carteira.",
    defaultRedirect: "/app/atendimento",
  },
  {
    id: "mock-cliente",
    role: "Cliente",
    displayName: "Transportadora Aurora Ltda",
    storeLabel: "Cliente B2B",
    avatarInitials: "TA",
    description: "Cliente B2B — vitrine pública e portal.",
    defaultRedirect: "/loja",
  },
];

export const MOCK_USER_BY_ID = new Map(MOCK_USERS.map((u) => [u.id, u]));

export const LOCALSTORAGE_USER_KEY = "gallo-mock-user";
