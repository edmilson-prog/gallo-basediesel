import type { Division, ID, ISO8601, ThemeMode, ThemeName } from "./common";
import type { VehicleCadastroMode } from "./platform";

/** Internal sellers are employees; external are field reps with no salary; representative is a contractor brand rep. */
export type SellerType = "internal" | "external" | "representative";

/** Real-time availability of a seller for chat distribution. */
export type SellerAvailability = "online" | "ausente" | "ocupado" | "offline";

/** Commission tier reserved for external sellers and representatives. */
export type CommissionTier = "junior" | "pleno" | "senior" | "master";

/** Visual preferences stored per seller (consumed by ThemeProvider). */
export interface IThemePreference {
  mode: ThemeMode;
  theme: ThemeName;
}

/** Commission rule attached to an external seller / representative. */
export interface ICommissionRule {
  /** Base on which the rate is applied. */
  base: "revenue" | "margin";
  /** Decimal rate (0.05 = 5%). */
  rate: number;
}

/**
 * Sales staff — internal seller, external rep or contractor.
 *
 * @see ../../../docs/glossario.md#vendedor
 */
export interface ISeller {
  id: ID;
  storeId: ID;
  /**
   * Stores this seller can switch into via the StoreSwitcher (PRD-007).
   * Omit or include only the primary `storeId` for single-store users.
   * Owner-equivalents typically include the full list of active stores.
   */
  accessibleStoreIds?: ID[];
  fullName: string;
  /**
   * Short display name shown to customers on outbound WhatsApp messages
   * ("nome de exibição nos atendimentos"). When set, it is prepended as a bold
   * signature (`*Name:* ...`). Empty/undefined = messages are not signed.
   */
  attendantName?: string;
  email: string;
  phone?: string;
  type: SellerType;
  availability: SellerAvailability;
  /** Divisions the seller is authorized to operate on. On the MVP always `['parts']`. */
  divisions: Division[];
  themePreference?: IThemePreference;
  /** Reserved for external sellers — operating region. */
  region?: string;
  /** Reserved for external/representative — commission tier. */
  commissionTier?: CommissionTier;
  /** Reserved for representatives that report to another seller. */
  parentSellerId?: ID;
  /** Reserved for external/representative — commission rule. */
  commissionRule?: ICommissionRule;
  /**
   * Optional override of the store-level vehicle cadastro mode (PRD-016).
   * When defined, this takes precedence over `IPlatformSettings.vehicleCadastroMode`
   * for actions performed by this seller.
   */
  vehicleCadastroMode?: VehicleCadastroMode;
  /** Department the user belongs to (PRD-211 — at most one in MVP). */
  departmentId?: ID | null;
  /** Rotation participation toggle (PRD-213 placeholder — created here). */
  rotation?: { enabled: boolean };
  active: boolean;
  /** Soft delete (users CRUD) — set means hidden from lists; login revoked. */
  deletedAt?: ISO8601;
  createdAt: ISO8601;
}

/** Canonical role names recognized by the RBAC layer (PRD-006). */
export type RoleName =
  | "Owner"
  | "Gestor"
  | "Vendedor"
  | "SDR"
  | "Cliente"
  | "VendedorExterno"
  | "Financeiro";

/** Action verbs that can be authorized for a given resource. */
export type PermissionAction = "view" | "create" | "edit" | "delete" | "approve";

/** Scope on which a permission applies. */
export type PermissionScope = "own" | "team" | "store" | "all";

/** Atomic permission: a verb on a resource, restricted by scope. */
export interface IPermission {
  /** Logical resource name (e.g. "customer", "order", "conversation"). */
  resource: string;
  actions: PermissionAction[];
  scope: PermissionScope;
}

/** Persisted, editable role (PRD-211). `slug` is stable and referenced by code/RLS. */
export interface IRole {
  id: ID;
  /** Stable identifier referenced by code and RLS — immutable for system roles. */
  slug: string;
  /** Human label shown in the UI. */
  name: string;
  description?: string;
  /** System roles are protected against rename/delete; permissions still editable. */
  isSystem: boolean;
  /** Owner only: permission set is immutable (prevents self-lockout). */
  isOwnerImmutable: boolean;
  /**
   * One of the 7 system role slugs. Governs RLS enforcement for custom roles:
   * a custom role can never grant beyond its base system role. For system roles,
   * baseRole === slug.
   */
  baseRole: RoleName;
  /** null = global role (MVP default); future: per-store custom roles. */
  storeId?: ID | null;
  permissions: IPermission[];
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

/** RBAC resource catalog entry — resources become data, not a code union (PRD-211). */
export interface IRbacResource {
  /** Stable key matching the ResourceName union (e.g. "customer"). */
  key: string;
  /** Friendly label (e.g. "Clientes"). */
  label: string;
  /** Area/group for collapsible UI grouping (e.g. "Comercial"). */
  group: string;
  /** Display order within the group. */
  sortOrder: number;
}

/**
 * Immutable record of a sensitive action.
 * `before` / `after` are `unknown` to keep the type free of domain coupling —
 * each writer is responsible for sanitizing PII before persisting.
 */
export interface IAuditLog {
  id: ID;
  actorId: ID;
  action: string;
  resource: string;
  resourceId: ID;
  before?: unknown;
  after?: unknown;
  timestamp: ISO8601;
  storeId: ID;
}
