import type { ID, ISO8601, Money } from "./common";

/** Lead temperature — heuristic indicator suggested by SDR, adjustable by humans. */
export type LeadTemperature = "frio" | "morno" | "quente";

/** Origin channel of a lead. */
export type LeadOrigin = "whatsapp" | "ecommerce" | "indicacao" | "google" | "outro" | "import";

/**
 * What the next agreed action actually IS, alongside the date it is due.
 *
 * A date on its own answers "when" and leaves "what" to whoever remembers the
 * conversation — which is exactly the state the detail screen was in. Kept as a
 * closed set rather than free text: the point is that the four ways out of a
 * stalled lead are named and countable, not that anybody can write a sentence.
 */
export type LeadNextActionKind = "ligar" | "orcamento" | "retomar" | "visita";

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
  /**
   * @deprecated Snapshot of the single-pipeline era. The truth now lives in
   * `lead_funnel_entries.stage_id`, one per funnel. Still written by legacy
   * call sites; removed once phase 4 migrates them.
   */
  stage: ILeadStage;
  temperature: LeadTemperature;
  origin: LeadOrigin;
  /**
   * @deprecated Aggregate/legacy value. The per-funnel value lives in
   * `ILeadFunnelEntry.estimatedValue` — a lead in two funnels is two distinct
   * revenues, and reading this one per membership double-counts the forecast.
   */
  estimatedValue?: Money;
  /** Date for the next agreed follow-up action. */
  nextActionAt?: ISO8601;
  /**
   * Which action was agreed, when one was. Optional independently of
   * `nextActionAt`: rows written before the column existed carry a date and no
   * kind, and the UI degrades to showing the deadline alone.
   */
  nextActionKind?: LeadNextActionKind;
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
