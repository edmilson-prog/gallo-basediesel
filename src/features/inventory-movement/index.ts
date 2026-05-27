/**
 * Inventory Movement feature barrel (PRD-052).
 *
 * Compõe o engine puro `deriveInventoryMovements` com os providers para
 * expor:
 *  - `/app/gestao/estoque-movimentacao` — `InventoryMovementPage`
 *
 * Movimentações no MVP são derivadas de pedidos pagos (saida_venda) e
 * devolvidos (devolucao). Os outros 3 tipos (entrada_compra,
 * ajuste_inventario, transferencia_loja) são placeholders coerentes
 * preparados para ativação na Fase 2 via integração DINTEC.
 */

export { deriveInventoryMovements } from "./engine";
export type { IDeriveMovementsContext } from "./engine";

export { InventoryMovementPage } from "./pages/InventoryMovementPage";

export { useInventoryMovements } from "./hooks/useInventoryMovements";
export type {
  IInventoryMovementsFilters,
  IUseInventoryMovementsResult,
} from "./hooks/useInventoryMovements";

export {
  useInventoryMovementFilters,
  validateInventoryMovementSearch,
} from "./hooks/useInventoryMovementsFilters";
export type {
  IInventoryMovementSearch,
  IInventoryMovementFiltersState,
  IUseInventoryMovementFiltersResult,
  MovementPeriod,
} from "./hooks/useInventoryMovementsFilters";

export { MovementTypeBadge, MOVEMENT_TYPE_LABELS } from "./components/MovementTypeBadge";
export { RecentMovementsWidget } from "./components/RecentMovementsWidget";
export type { IRecentMovementsWidgetProps } from "./components/RecentMovementsWidget";
