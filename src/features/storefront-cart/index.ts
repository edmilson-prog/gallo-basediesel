/**
 * Storefront cart feature barrel (PRD-064).
 *
 * Owns `/loja/carrinho`, `/loja/checkout` and `/loja/pedido-confirmado/:orderId`.
 * The cart state itself still lives in `@/features/storefront/store/cartStore`
 * (introduced by PRD-060) — Fase 2 will move it here together with the
 * Supabase-backed server cart.
 */

export { CartPage } from "./pages/CartPage";
export { CheckoutPage } from "./pages/CheckoutPage";
export { OrderConfirmedPage } from "./pages/OrderConfirmedPage";

export { CartMiniPreview } from "./components/CartMiniPreview";
export { useCartShipping } from "./hooks/useCartShipping";
export { useCartValidation } from "./hooks/useCartValidation";
export { useCheckoutState } from "./hooks/useCheckoutState";
export type {
  CheckoutStep,
  CheckoutIdentity,
  IGuestIdentity,
  IRegisteredIdentity,
  ICheckoutAddress,
  ICheckoutPayment,
  ICheckoutState,
} from "./hooks/useCheckoutState";
