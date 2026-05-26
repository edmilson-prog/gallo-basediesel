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
export type OrderPaymentStatus = "pendente" | "parcial" | "pago" | "estornado";

/** Fulfillment status of an order. */
export type OrderFulfillmentStatus =
  | "pendente"
  | "separacao"
  | "expedido"
  | "entregue"
  | "cancelado";

/** Channel that originated an order. */
export type OrderOrigin = "whatsapp" | "ecommerce" | "portal" | "pwa_externo" | "manual";

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
  /** Source quote if the order was converted from one. */
  quoteId?: ID;
  items: IOrderItem[];
  subtotal: Money;
  discount: Money;
  shipping: Money;
  total: Money;
  paymentCondition: string;
  paymentStatus: OrderPaymentStatus;
  fulfillmentStatus: OrderFulfillmentStatus;
  origin: OrderOrigin;
  division: Division;
  /** Fiscal note number, once issued. */
  nfNumber?: string;
  /** Fiscal note issuance date. */
  nfDate?: ISO8601;
  notes?: string;
  createdAt: ISO8601;
  updatedAt: ISO8601;
}

/** Status of a commission record. */
export type CommissionStatus = "pendente" | "aprovado" | "pago" | "contestado";

/**
 * Commission — payout owed to a seller for a closed order.
 *
 * @see ../../../docs/glossario.md#comissao
 */
export interface ICommission {
  id: ID;
  storeId: ID;
  sellerId: ID;
  orderId: ID;
  /** Base value over which the rate is applied (revenue or margin, see ICommissionRule). */
  baseValue: Money;
  /** Decimal rate (0.05 = 5%). */
  rate: number;
  /** Resolved value = baseValue * rate. */
  value: Money;
  /** Reference period in `YYYY-MM` format. */
  period: string;
  status: CommissionStatus;
  notes?: string;
  createdAt: ISO8601;
}
