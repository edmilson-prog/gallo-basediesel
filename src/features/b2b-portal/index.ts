/**
 * B2B corporate portal feature barrel (PRD-071).
 *
 * Dedicated `/portal/*` sub-app for advanced B2B customers: fleet management,
 * structured purchase requests with internal approval, multi-user with roles,
 * billing placeholder, spend analytics and support. Institutional identity,
 * distinct from /loja/conta (B2C essentials).
 */
export { PortalLayout } from "./components/PortalLayout";
export { PortalLoginPage } from "./pages/PortalLoginPage";
export { PortalHomePage } from "./pages/PortalHomePage";
export { PortalFleetPage } from "./pages/PortalFleetPage";
export { PortalVehicleDetailPage } from "./pages/PortalVehicleDetailPage";
export { PortalRequestsPage } from "./pages/PortalRequestsPage";
export { PortalNewRequestPage, type IPortalNewRequestSearch } from "./pages/PortalNewRequestPage";
export { PortalRequestDetailPage } from "./pages/PortalRequestDetailPage";
export { PortalOrdersListPage } from "./pages/PortalOrdersListPage";
export { PortalOrderDetailPage } from "./pages/PortalOrderDetailPage";
export { PortalBillingPage } from "./pages/PortalBillingPage";
export { PortalAnalyticsPage } from "./pages/PortalAnalyticsPage";
export { PortalUsersPage } from "./pages/PortalUsersPage";
export { PortalProfilePage } from "./pages/PortalProfilePage";
export { PortalSupportPage } from "./pages/PortalSupportPage";

export { readPortalSessionSync } from "./store/portalAuthStore";
export { usePortalAuth } from "./hooks/usePortalAuth";
