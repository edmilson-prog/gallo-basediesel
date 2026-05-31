/**
 * Storefront account feature barrel (PRD-065).
 *
 * Owns the customer-side authenticated area: `/loja/login`, `/loja/cadastro`,
 * `/loja/recuperar-senha` and `/loja/conta/*`. Auth is mock (Zustand +
 * localStorage) — designed for a drop-in Supabase Auth replacement on Fase 2.
 */

export { LoginPage } from "./pages/LoginPage";
export { RegisterPage } from "./pages/RegisterPage";
export { PasswordRecoveryPage } from "./pages/PasswordRecoveryPage";
export { AccountDashboardPage } from "./pages/AccountDashboardPage";
export { AccountOrdersPage } from "./pages/AccountOrdersPage";
export { AccountOrderDetailPage } from "./pages/AccountOrderDetailPage";
export { AccountQuotesPage } from "./pages/AccountQuotesPage";
export { AccountQuoteDetailPage } from "./pages/AccountQuoteDetailPage";
export { AccountProfilePage } from "./pages/AccountProfilePage";
export { AccountAddressesPage } from "./pages/AccountAddressesPage";
export { AccountVehiclesPage } from "./pages/AccountVehiclesPage";
export { AccountNotificationsPage } from "./pages/AccountNotificationsPage";
export { AccountNotificationPreferencesPage } from "./pages/AccountNotificationPreferencesPage";

export { AccountLayout } from "./components/AccountLayout";
export { CustomerAccountMenu } from "./components/CustomerAccountMenu";

export { requireCustomerSession } from "./guards";
export { useCustomerAuth } from "./hooks/useCustomerAuth";
export {
  useCustomerAuthStore,
  selectIsCustomerAuthenticated,
  readCustomerSessionSync,
  type ICustomerSavedAddress,
} from "./store/customerAuthStore";
