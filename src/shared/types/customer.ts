import type { ID, ISO8601, Money } from "./common";

/** Lifecycle status of a customer. */
export type CustomerStatus = "ativo" | "dormente" | "recuperacao" | "perdido";

/** Vehicle registration approval state. */
export type VehicleCadastroStatus = "aprovado" | "pendente" | "rejeitado";

/** Shared base fields between B2B and B2C customers. */
interface ICustomerBase {
  id: ID;
  storeId: ID;
  email?: string;
  phone: string;
  /** Primary seller responsible for this customer (1:1 wallet rule). */
  sellerId: ID;
  status: CustomerStatus;
  tags: string[];
  notes: ICustomerNote[];
  firstPurchaseAt?: ISO8601;
  lastPurchaseAt?: ISO8601;
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
