import type { ID, ISO8601, Money } from "./common";

/** Lead temperature — heuristic indicator suggested by SDR, adjustable by humans. */
export type LeadTemperature = "frio" | "morno" | "quente";

/** Origin channel of a lead. */
export type LeadOrigin = "whatsapp" | "ecommerce" | "indicacao" | "google" | "outro" | "import";

/** Pipeline stage of a lead. Stages are configurable per store (see IPlatformSettings.pipelineStages). */
export interface ILeadStage {
  id: ID;
  name: string;
  order: number;
  color: string;
}

/**
 * Lead — a contact that has not closed a purchase yet.
 * On conversion, `convertedToCustomerId` points to the resulting `ICustomer`.
 *
 * @see ../../../docs/glossario.md#lead
 */
export interface ILead {
  id: ID;
  storeId: ID;
  /**
   * Primary seller responsible for working this lead, or `null` when
   * ownerless — an imported/echo-created lead awaiting its first live
   * inbound message, at which point rotation assigns an owner.
   */
  sellerId: ID | null;
  name: string;
  phone: string;
  email?: string;
  /**
   * WhatsApp profile picture captured by the webhook / copied by the Frente B
   * migration (`leads.avatar_url`, migration 20260718202917). Read-only in the
   * app — no editor writes it.
   */
  avatarUrl?: string;
  stage: ILeadStage;
  temperature: LeadTemperature;
  origin: LeadOrigin;
  /** Estimated commercial value of this opportunity. */
  estimatedValue?: Money;
  /** Date for the next agreed follow-up action. */
  nextActionAt?: ISO8601;
  lossReason?: string;
  lossNotes?: string;
  convertedToCustomerId?: ID;
  /** Conversations associated with this lead. */
  conversations: ID[];
  tags: string[];
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

/** A free-text note recorded against a lead (mirrors ICustomerNote). */
export interface ILeadNote {
  id: ID;
  authorId: ID;
  content: string;
  createdAt: ISO8601;
}

/** Type of a wallet (carteira) transfer between sellers. */
export type CarteiraTransferType = "temporary" | "permanent_individual" | "permanent_batch";

/** Lifecycle status of a wallet transfer. */
export type CarteiraTransferStatus = "active" | "reverted" | "expired";

/**
 * Wallet transfer — moves customers from one seller to another.
 *
 * Three flavors:
 *  - `temporary`: ends at `endDate`; customers auto-revert to `fromSellerId`.
 *  - `permanent_individual`: single customer permanent transfer.
 *  - `permanent_batch`: many customers transferred at once permanently.
 *
 * @see ../../../docs/glossario.md#carteira
 */
export interface ICarteiraTransfer {
  id: ID;
  storeId: ID;
  type: CarteiraTransferType;
  fromSellerId: ID;
  toSellerId: ID;
  customerIds: ID[];
  reason: string;
  startDate: ISO8601;
  /** Set only when `type === 'temporary'`. */
  endDate?: ISO8601;
  /** Concrete moment the auto-revert job will run. Used for indexing/timers. */
  autoRevertAt?: ISO8601;
  status: CarteiraTransferStatus;
  /** Author of the transfer (gestor or owner). */
  createdBy: ID;
  createdAt: ISO8601;
}
