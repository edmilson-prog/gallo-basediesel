import type { ICustomerAddress } from "./customer";
import type { Division, ID, ISO8601, Money } from "./common";

/** Lifecycle status of a quote. */
export type QuoteStatus =
  | "rascunho"
  | "enviado"
  | "aceito"
  | "recusado"
  | "expirado"
  | "convertido";

/** Channel that originated a quote. */
export type QuoteOrigin = "sdr" | "vendedor" | "cliente_portal" | "ecommerce";

/** Payment method options for a quote (PRD-031 RF-016). */
export type QuotePaymentMethod = "pix" | "boleto" | "cartao" | "prazo" | "outro";

/**
 * Single line of a quote.
 * Carries snapshots of name/price/SKU so the quote stays stable even if the part later changes.
 */
export interface IQuoteItem {
  id: ID;
  /** Reference to the part — for navigation only; do not derive display fields from it. */
  partId: ID;
  /** Snapshot of part SKU at the moment the item was added. */
  partSku: string;
  /** Snapshot of part name at the moment the item was added. */
  partName: string;
  quantity: number;
  /** Snapshot of unit price at the moment the item was added. */
  unitPrice: Money;
  /** Line-level discount in monetary value. */
  discount: Money;
  /** Line total = quantity * unitPrice - discount. */
  total: Money;
}

/**
 * Quote (orçamento) — proposal sent to a customer / lead.
 *
 * @see ../../../docs/glossario.md#orcamento
 */
export interface IQuote {
  id: ID;
  storeId: ID;
  /** Human-readable sequential identifier (e.g. `OR-2026-0123`). PRD-031 RF-002. */
  number: string;
  /** Customer recipient — mutually exclusive with `leadId`. */
  customerId?: ID;
  /** Lead recipient — mutually exclusive with `customerId`. */
  leadId?: ID;
  /** Conversation the quote was issued during, when applicable (SDR or inbox). */
  conversationId?: ID;
  /** Seller that issued the quote (may be the SDR when origin is `sdr`). */
  sellerId: ID;
  items: IQuoteItem[];
  subtotal: Money;
  discount: Money;
  /** Justification required when discount over the platform threshold (PRD-031 RF-018). */
  discountReason?: string;
  shipping: Money;
  total: Money;
  /**
   * Free-form combined payment description.
   * Kept for backwards compatibility with PRD-022; PRD-031 prefers
   * `paymentMethod` + `paymentTerms` for structured input.
   */
  paymentCondition: string;
  /** Structured payment method (PRD-031 RF-016). */
  paymentMethod?: QuotePaymentMethod;
  /** Free-form payment terms ("à vista", "30/60/90", etc). PRD-031 RF-016. */
  paymentTerms?: string;
  /** Delivery address override — defaults to the customer's registered address. */
  deliveryAddress?: ICustomerAddress;
  validUntil: ISO8601;
  status: QuoteStatus;
  origin: QuoteOrigin;
  division: Division;
  /** True when the discount applied requires Gestor/Owner approval (PRD-031 RF-029). */
  requiresApproval?: boolean;
  /** Seller id of the approver, once approved. */
  approvedBy?: ID;
  approvedAt?: ISO8601;
  /** Reason given by the approver when rejecting the discount. */
  rejectedReason?: string;
  /** Set when status transitions to `convertido`. */
  convertedToOrderId?: ID;
  convertedAt?: ISO8601;
  notes?: string;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

/** Payment status of an order. */
export type OrderPaymentStatus =
  | "pendente"
  | "parcial"
  | "pago"
  | "estornado"
  /** Pendente de pagamento e prazo já vencido (PRD-032). */
  | "vencido";

/** Fulfillment status of an order. */
export type OrderFulfillmentStatus =
  | "pendente"
  | "separacao"
  | "expedido"
  | "entregue"
  | "cancelado"
  /** Pedido devolvido pelo cliente (PRD-032). */
  | "devolvido";

/** Channel that originated an order. */
export type OrderOrigin = "whatsapp" | "ecommerce" | "portal" | "pwa_externo" | "manual";

/**
 * Aggregated, customer-facing order status (PRD-032).
 * Derived from `paymentStatus`, `fulfillmentStatus` and `canceledAt`
 * via {@link computeOrderStatus} — never persisted on the order.
 */
export type OrderStatus =
  | "aguardando_pagamento"
  | "pago_aguardando_envio"
  | "em_separacao"
  | "enviado"
  | "entregue"
  | "concluido"
  | "cancelado"
  | "devolvido";

/** Structured payment method options for an order (PRD-032). */
export type OrderPaymentMethod = "pix" | "boleto" | "cartao" | "prazo" | "outro";

/**
 * Preview snapshot of the commission owed to the seller for a given order
 * (PRD-032 RF-025). Final commission is computed by PRD-047 — this struct
 * is intentionally lightweight (no tier / split rules).
 */
export interface ICommissionPreview {
  /** Base value (subtotal - discount, without shipping). */
  baseValue: Money;
  /** Decimal rate (0.03 = 3%). */
  commissionRate: number;
  /** Estimate = baseValue * commissionRate. */
  estimatedCommission: Money;
  /** Human-readable description of the rules applied. */
  rules: string[];
  /** Always true on MVP — final calculation lives in PRD-047. */
  finalCalculationInPRD047: boolean;
}

/**
 * Single line of an order.
 * Extends `IQuoteItem` with cost/margin snapshots that are sealed at the moment of the sale.
 */
export interface IOrderItem {
  id: ID;
  partId: ID;
  partSku: string;
  partName: string;
  quantity: number;
  unitPrice: Money;
  unitCost: Money;
  discount: Money;
  total: Money;
  /** Margin value at the moment of the sale (in monetary value). */
  marginValue: Money;
  /**
   * Optional reference to a vehicle the part was applied to (PRD-032 RF-023).
   * When set, the order lifecycle creates a matching {@link IVehicleServiceEntry}
   * on the customer's vehicle so the service history (PRD-016) stays in sync.
   */
  appliedToVehicleId?: ID;
}

/**
 * Order — confirmed commercial transaction.
 *
 * @see ../../../docs/glossario.md#pedido
 */
export interface IOrder {
  id: ID;
  storeId: ID;
  customerId: ID;
  sellerId: ID;
  /** Human-readable sequential identifier (e.g. `PD-2026-0042`). PRD-032 RF-003. */
  number?: string;
  /** Source quote if the order was converted from one. */
  quoteId?: ID;
  /** Conversation that originated the order, when applicable (SDR / inbox). */
  conversationId?: ID;
  items: IOrderItem[];
  subtotal: Money;
  discount: Money;
  shipping: Money;
  total: Money;
  /**
   * Free-form combined payment description.
   * Kept for backwards compatibility; PRD-032 prefers `paymentMethod` + `paymentTerms`.
   */
  paymentCondition: string;
  /** Structured payment method (PRD-032). */
  paymentMethod?: OrderPaymentMethod;
  /** Free-form payment terms ("à vista", "30/60/90"). PRD-032. */
  paymentTerms?: string;
  paymentStatus: OrderPaymentStatus;
  /** Timestamp the payment was confirmed (PRD-032). */
  paidAt?: ISO8601;
  fulfillmentStatus: OrderFulfillmentStatus;
  /** Delivery address (snapshot at creation; editable until shipped). PRD-032. */
  deliveryAddress?: ICustomerAddress;
  /** Carrier / transportadora — free text on MVP. PRD-032. */
  carrier?: string;
  /** Tracking code stored as text on MVP (no integration). PRD-032. */
  trackingCode?: string;
  /** Timestamp the order was shipped. PRD-032. */
  shippedAt?: ISO8601;
  /** Timestamp the order was delivered. PRD-032. */
  deliveredAt?: ISO8601;
  /** Timestamp the order was returned (when fulfillmentStatus === 'devolvido'). PRD-032. */
  returnedAt?: ISO8601;
  /** Reason given when the order was returned. PRD-032. */
  returnReason?: string;
  origin: OrderOrigin;
  division: Division;
  /** Fiscal note number, once issued. */
  nfNumber?: string;
  /** Fiscal note issuance date. */
  nfDate?: ISO8601;
  /** Cancellation timestamp (PRD-032). */
  canceledAt?: ISO8601;
  /** Actor that cancelled the order (PRD-032). */
  canceledBy?: ID;
  /** Required reason given on cancellation (PRD-032). */
  cancelReason?: string;
  /** Internal notes — visible to staff only. */
  internalNotes?: string;
  /** Customer-facing notes (printed on receipts, e-mail body, etc). */
  customerNotes?: string;
  /** Snapshot of the commission preview computed at creation (PRD-032 RF-025). */
  commissionPreview?: ICommissionPreview;
  /** Generic notes — legacy field kept for backwards compatibility. */
  notes?: string;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

/**
 * Status of a commission record (PRD-047).
 *
 * Lifecycle:
 *  - `calculated`: emitted automatically when an order is paid.
 *  - `pending_approval`: optionally used when policy requires explicit review.
 *  - `approved`: locked in during monthly close (`closedInPeriod` set).
 *  - `paid`: payment registered by the Financeiro role.
 *  - `disputed`: seller filed a dispute; awaits manager resolution.
 *  - `canceled`: voided (e.g. order canceled / returned).
 */
export type CommissionStatus =
  | "calculated"
  | "pending_approval"
  | "approved"
  | "paid"
  | "disputed"
  | "canceled";

/**
 * How a commission is split between titular and coverage sellers when a
 * temporary `ICarteiraTransfer` is active at the moment the order is paid
 * (PRD-018 + PRD-047).
 */
export interface ICommissionSplitDetails {
  /** Seller that received the customer during the coverage window. */
  coverageSellerId: ID;
  /** Original (titular) seller of the customer. */
  titularSellerId: ID;
  /** Share that goes to the coverage seller (0..1). */
  coveragePct: number;
  /** Share that goes to the titular seller (0..1). */
  titularPct: number;
  /** Reference to the transfer that triggered the split. */
  transferId: ID;
}

/** Type of goal bonus payout. */
export type CommissionGoalBonusType = "fixed" | "percentage_points";

/**
 * Optional goal-based bonus inside a commission rule (PRD-047).
 *
 * - `fixed`: adds a flat R$ amount once the goal threshold is met.
 * - `percentage_points`: adds N percentage points to the base rate
 *   (e.g. `bonusValue: 1` raises a 3% rate to 4%).
 */
export interface ICommissionGoalBonus {
  /** Goal type that triggers the bonus (matches `IGoal.type`). */
  goalType: string;
  /** Percentage of goal achievement that triggers the bonus (e.g. 100). */
  threshold: number;
  bonusType: CommissionGoalBonusType;
  /** R$ amount (fixed) or percentage points (percentage_points). */
  bonusValue: number;
}

/**
 * Configurable commission rule (PRD-047).
 *
 * Either store-wide (when `sellerId` is undefined) or specific to a seller.
 * When resolving the rule for an order: seller-specific > store-wide default.
 * Snapshotted into `ICommission.ruleSnapshot` so retroactive edits never
 * mutate already-emitted commissions.
 *
 * Note: not to be confused with the legacy `ICommissionRule` in `people.ts`,
 * which lives on `ISeller.commissionRule` and is a lightweight
 * `{ base, rate }` preference for external sellers — kept for back-compat.
 */
export interface ICommissionRuleConfig {
  id: ID;
  storeId: ID;
  /** Human-readable name shown on the admin panel. */
  name: string;
  /** Seller this rule applies to. Undefined = store default. */
  sellerId?: ID;
  /** Decimal base rate (0.03 = 3%). */
  baseRate: number;
  /** Optional goal-based bonus. */
  goalBonus?: ICommissionGoalBonus;
  /** Validity window — rules outside the window are ignored. */
  validFrom: ISO8601;
  validUntil?: ISO8601;
  isActive: boolean;
  createdBy: ID;
  createdAt: ISO8601;
}

/**
 * Snapshot of a goal at the moment a commission was calculated — used to
 * preserve evidence of the threshold met when bonus was awarded.
 */
export interface ICommissionGoalSnapshot {
  id: ID;
  type: string;
  targetValue: Money;
  currentValue: Money;
  achievementPct: number;
  period: string;
}

/**
 * Commission — payout owed to a seller for a paid order (PRD-047).
 *
 * @see ../../../docs/glossario.md#comissao
 */
export interface ICommission {
  id: ID;
  storeId: ID;
  sellerId: ID;
  orderId: ID;
  /** Base value over which the rate is applied (subtotal - discount). */
  baseValue: Money;
  /** Decimal rate effectively applied (already includes goal bonus when
   *  bonus type is `percentage_points`). */
  rate: number;
  /** Decimal base rate from the rule (without goal bonus). */
  baseRate: number;
  /** Base commission = baseValue * baseRate (without goal bonus). */
  baseCommission: Money;
  /** Goal bonus added on top of `baseCommission` (R$). */
  goalBonus: Money;
  /** Total commission = baseCommission + goalBonus (after split, when applicable). */
  totalCommission: Money;
  /** Backward-compatible alias of `totalCommission`. */
  value: Money;
  /** Whether this record is part of a split (titular vs coverage). */
  isSplit: boolean;
  /** Populated when `isSplit` is true (PRD-018). */
  splitDetails?: ICommissionSplitDetails;
  /** Immutable snapshot of the rule applied at calculation time. */
  ruleSnapshot?: ICommissionRuleConfig;
  /** Immutable snapshot of the goal when a goal bonus was awarded. */
  goalSnapshot?: ICommissionGoalSnapshot;
  /** Reference period in `YYYY-MM` format (derived from `order.paidAt`). */
  period: string;
  /** Closing period in `YYYY-MM` format — set on monthly close. */
  closedInPeriod?: string;
  /** Timestamp the commission was approved (monthly close). */
  approvedAt?: ISO8601;
  /** Actor that closed the period. */
  approvedBy?: ID;
  /** Timestamp payment was registered (Financeiro). */
  paidAt?: ISO8601;
  /** Actor that registered payment. */
  paidBy?: ID;
  /** Dispute justification provided by the seller. */
  disputeReason?: string;
  /** Timestamp the dispute was opened. */
  disputedAt?: ISO8601;
  /** Resolution note when a dispute is resolved. */
  disputeResolution?: string;
  /** Actor that resolved the dispute. */
  disputeResolvedBy?: ID;
  /** Timestamp the dispute was resolved. */
  disputeResolvedAt?: ISO8601;
  status: CommissionStatus;
  notes?: string;
  /** Timestamp the commission was first calculated. */
  calculatedAt: ISO8601;
  createdAt: ISO8601;
}
