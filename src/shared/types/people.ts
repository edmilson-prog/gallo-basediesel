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

/** Role aggregating a set of permissions. */
export interface IRole {
  id: ID;
  name: RoleName;
  description?: string;
  permissions: IPermission[];
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
