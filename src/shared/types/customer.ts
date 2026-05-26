import type { ABCClass } from "./bi";
import type { ID, ISO8601, Money } from "./common";

/** Lifecycle status of a customer. */
export type CustomerStatus = "ativo" | "dormente" | "recuperacao" | "perdido";

/** Vehicle registration approval state. */
export type VehicleCadastroStatus = "aprovado" | "pendente" | "rejeitado";

/** Postal address — used by both B2B and B2C customers. */
export interface ICustomerAddress {
  street: string;
  number: string;
  complement?: string;
  district: string;
  city: string;
  state: string;
  zipCode: string;
}

/**
 * Pre-computed purchase statistics displayed on the customer profile (PRD-012).
 * Populated by the analytics layer (mock generator on Fase 1; materialized view on Fase 2).
 */
export interface ICustomerPurchaseStats {
  /** Average ticket in BRL across the last 12 months. */
  ticketMedio: Money;
  /** Lifetime value — sum of every paid order, all-time. */
  ltv: Money;
  /** Number of orders in the last 12 months. */
  orderCount12m: number;
}

/** Shared base fields between B2B and B2C customers. */
interface ICustomerBase {
  id: ID;
  storeId: ID;
  email?: string;
  phone: string;
  address?: ICustomerAddress;
  /** Primary seller responsible for this customer (1:1 wallet rule). */
  sellerId: ID;
  status: CustomerStatus;
  tags: string[];
  notes: ICustomerNote[];
  firstPurchaseAt?: ISO8601;
  lastPurchaseAt?: ISO8601;
  /**
   * When the customer originated from a lead that was later converted, this points
   * back to the source lead. Drives the "Histórico pré-conversão" badge on the
   * profile (PRD-012 — preserves organizational memory across the lead→customer transition).
   */
  convertedFromLeadId?: ID;
  /** ISO8601 of the conversion event — used to compute "N dias até conversão". */
  convertedFromLeadAt?: ISO8601;
  /** Seller / SDR that closed the conversion. */
  convertedBySellerId?: ID;
  /** Pre-computed BI snapshot — see {@link ICustomerPurchaseStats}. */
  purchaseStats?: ICustomerPurchaseStats;
  /** ABC class snapshot (`A`, `B`, `C`) — convenience copy of latest IABCClassification. */
  abcClass?: ABCClass;
  /** Share of total store revenue (0..1) — convenience copy of latest IABCClassification. */
  abcShare?: number;
  /** Customer Portal granular permissions — read-only on the profile (edit lives in PRD-019). */
  portal?: IPortalSettings;
  createdAt: ISO8601;
}

/** Business customer (CNPJ-based). */
export interface ICustomerB2B extends ICustomerBase {
  type: "B2B";
  cnpj: string;
  razaoSocial: string;
  nomeFantasia: string;
  /** Name of the human contact at the business. */
  contactName: string;
}

/** Individual customer (CPF-based). */
export interface ICustomerB2C extends ICustomerBase {
  type: "B2C";
  cpf: string;
  fullName: string;
}

/**
 * Customer — either B2B (CNPJ) or B2C (CPF).
 * Discriminated union over `type` forces correct fields per variant.
 *
 * @see ../../../docs/glossario.md#ciclo-de-vida-do-cliente
 */
export type ICustomer = ICustomerB2B | ICustomerB2C;

/**
 * Free-text note attached to a customer.
 * Always shared (no private flag) — visibility is governed by RBAC, not by the note itself.
 */
export interface ICustomerNote {
  id: ID;
  authorId: ID;
  content: string;
  createdAt: ISO8601;
}

/** A service / repair entry recorded against a vehicle. */
export interface IVehicleServiceEntry {
  id: ID;
  vehicleId: ID;
  orderId?: ID;
  /** Snapshot of part names sold/installed at the time of the service. */
  parts: string[];
  date: ISO8601;
  km?: number;
}

/**
 * Vehicle owned by a customer (fleet member).
 *
 * @see ../../../docs/glossario.md#aplicacao
 */
export interface IVehicle {
  id: ID;
  customerId: ID;
  brand: string;
  model: string;
  year: number;
  engine: string;
  plate?: string;
  vin?: string;
  currentKm?: number;
  serviceHistory: IVehicleServiceEntry[];
  cadastroStatus: VehicleCadastroStatus;
  createdAt: ISO8601;
}

/** Visibility scope of a saved segment filter. */
export type SegmentScope = "private" | "shared";

/**
 * Saved customer segment / filter.
 * Filters are a generic DSL of `Record<string, unknown>` to allow flexible querying
 * without coupling the model to a specific query engine.
 */
export interface ICustomerSegment {
  id: ID;
  ownerId: ID;
  name: string;
  description?: string;
  scope: SegmentScope;
  filters: Record<string, unknown>;
  /** Optional snapshot count, refreshed periodically. */
  estimatedSize?: number;
  createdAt: ISO8601;
}

/**
 * Granular permissions of a customer over the Customer Portal (PRD-071).
 * All flags default to `false`; portal is opt-in per customer.
 *
 * Embedded on the customer when the portal has been provisioned. Edited via
 * the admin surface (PRD-019); the profile (PRD-012) renders it read-only.
 */
export interface IPortalSettings {
  customerId: ID;
  enabled: boolean;
  canViewOrderHistory: boolean;
  canCreateQuote: boolean;
  canApproveQuote: boolean;
  canSeePriceTable: boolean;
  canDownloadNF: boolean;
  canSeeCreditLimit: boolean;
  /** Effective credit limit available to the customer (cached for portal display). */
  creditLimit?: Money;
}
