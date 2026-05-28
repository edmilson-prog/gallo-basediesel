import type { ID, ISO8601, Money } from "./common";
import type { PartCategory } from "./part-identification";

/**
 * Role of a portal user inside a B2B customer company (PRD-071).
 * - `admin`: full access (usually the fleet manager).
 * - `comprador`: creates requests, sees own orders.
 * - `visualizador`: read-only.
 */
export type PortalUserRole = "admin" | "comprador" | "visualizador";

/**
 * A user (employee) of a B2B customer with access to the corporate portal
 * (PRD-071 RF-004). Permissions are derived from the role but stored explicitly
 * so the admin can fine-tune them per user.
 */
export interface IPortalUser {
  id: ID;
  /** The company (ICustomer) this user belongs to. */
  customerId: ID;
  name: string;
  email: string;
  role: PortalUserRole;
  canCreateRequests: boolean;
  canApproveOrders: boolean;
  /** Maximum R$ amount this user can approve without escalation. */
  approvalLimit?: number;
  canManageFleet: boolean;
  canViewFinancial: boolean;
  isActive: boolean;
  createdAt: ISO8601;
}

/** Urgency of a portal purchase request. */
export type PortalRequestUrgency = "normal" | "urgente" | "programada";

/** Lifecycle status of a portal purchase request (PRD-071 RF-017). */
export type PortalRequestStatus =
  | "aberta"
  | "em_orcamento"
  | "orcada"
  | "aprovada"
  | "rejeitada"
  | "convertida"
  | "cancelada";

export interface IPortalRequestItem {
  id: ID;
  /** Optional reference to a catalog part — free text is allowed too. */
  partId?: ID;
  description: string;
  quantity: number;
  /** Vehicle the parts are destined to, when applicable. */
  targetVehicleId?: ID;
}

/**
 * Structured purchase request raised by a B2B buyer (PRD-071 RF-017). Distinct
 * from a direct checkout — GALLO responds with a quote (PRD-031) that, once
 * accepted (and approved internally when above the buyer's limit), converts to
 * an order (PRD-032).
 */
export interface IPortalRequest {
  id: ID;
  customerId: ID;
  /** Portal user that created the request. */
  requestedBy: ID;
  items: IPortalRequestItem[];
  urgency: PortalRequestUrgency;
  scheduledFor?: ISO8601;
  notes?: string;
  status: PortalRequestStatus;
  /** Quote GALLO issued in response (PRD-031). */
  relatedQuoteId?: ID;
  /** Order created once the request converts (PRD-032). */
  relatedOrderId?: ID;
  approvedBy?: ID;
  approvedAt?: ISO8601;
  /** Rough estimate shown before GALLO formally quotes. */
  estimatedTotal?: Money;
  storeId: ID;
  createdAt: ISO8601;
}

/**
 * Negotiated commercial contract for a B2B customer (PRD-071 RF-041).
 * Applied (as a placeholder calculation on the MVP) to prices shown in the
 * portal. Full pricing engine is a Fase 2 concern.
 */
export interface IPortalContract {
  /** Flat discount applied across the catalog. */
  discountPct?: number;
  /** Per-category discount overrides. */
  categoryDiscounts?: Partial<Record<PartCategory, number>>;
  /** Free-text special payment terms ("30/60/90", etc). */
  paymentTermsExtended?: string;
  /** Credit limit — placeholder for the billing module (Fase 2). */
  creditLimit?: Money;
}
