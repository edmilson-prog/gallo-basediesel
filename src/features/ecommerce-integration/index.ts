/**
 * E-commerce ↔ Central integration feature barrel (PRD-067).
 *
 * Orchestrates the "after checkout" flow: seller assignment, linked
 * conversation, seller/customer notifications (placeholders) and the
 * management widgets. The glue between /loja and /app.
 */
export { triggerEcommerceOrder, notifyCustomerOfStatusChange } from "./api/triggerEcommerceOrder";
export type {
  ITriggerEcommerceOrderOptions,
  ITriggerEcommerceOrderResult,
} from "./api/triggerEcommerceOrder";

export { EcommerceIntegrationConfigPage } from "./pages/EcommerceIntegrationConfigPage";
export { EcommerceBadge } from "./components/EcommerceBadge";
export { EcommerceOrdersWidget } from "./components/EcommerceOrdersWidget";

export { useEcommerceSellerNotifier } from "./hooks/useEcommerceSellerNotifier";
export { useEcommerceOrdersSummary } from "./hooks/useEcommerceOrdersSummary";
export type { IEcommerceOrdersSummary } from "./hooks/useEcommerceOrdersSummary";

export {
  useEcommerceNotificationStore,
  selectUnseenCountForSeller,
} from "./store/ecommerceNotificationStore";
export type { IEcommerceNotification } from "./store/ecommerceNotificationStore";

export { DEFAULT_ECOMMERCE_INTEGRATION_SETTINGS } from "./config/defaults";
export { renderTemplate, orderTemplateVars } from "./utils/renderTemplate";
