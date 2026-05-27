import type { ID, ISO8601 } from "./common";

/**
 * Kinds of stock movement (PRD-052).
 *
 * MVP: only `saida_venda` and `devolucao` are derived from real data
 * (paid and returned orders). The other three are reserved placeholders
 * that activate in Phase 2 once the DINTEC ERP integration lands.
 */
export type MovementType =
  | "saida_venda"
  | "entrada_compra"
  | "ajuste_inventario"
  | "transferencia_loja"
  | "devolucao";

/**
 * Immutable record of a single stock movement (PRD-052).
 *
 * On MVP, movements are derived purely from `IOrder` items (sales and
 * returns) — never persisted as a primary entity, never mutating
 * `IPart.stockAvailable`. They live as a read-only ledger.
 */
export interface IInventoryMovement {
  id: ID;
  type: MovementType;
  partId: ID;
  /** Snapshot of the part name at the moment of the movement. */
  partName: string;
  /** Snapshot of the OEM code (first one). */
  partOemCode?: string;
  /** Positive for inflows (entrada/devolucao), negative for outflows (saida). */
  quantity: number;
  /** Source order when the movement is a sale or return. */
  orderId?: ID;
  /** Human-readable order number when available. */
  orderNumber?: string;
  /** Fiscal note number — Phase 2 only. */
  invoiceNumber?: string;
  /** Free-text reason — required for manual adjustments (Phase 2). */
  reason?: string;
  /** User (or system) that performed the movement. */
  performedBy: ID;
  performedAt: ISO8601;
  storeId: ID;
  notes?: string;
}
