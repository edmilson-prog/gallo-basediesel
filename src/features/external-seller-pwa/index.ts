/**
 * External-seller PWA feature barrel (PRD-070).
 *
 * Mobile-first sub-app at `/pwa/*` for field sellers: portfolio, quick quote
 * wizard and visit agenda. Navigable skeleton — offline-first (service worker,
 * IndexedDB, sync) is a Fase 2 concern.
 */
export { PWALayout } from "./components/PWALayout";
export { PWALoginPage } from "./pages/PWALoginPage";
export { PWAHomePage } from "./pages/PWAHomePage";
export { PWAPortfolioPage } from "./pages/PWAPortfolioPage";
export { PWACustomerDetailPage } from "./pages/PWACustomerDetailPage";
export { PWAQuickQuotePage, type IPwaQuickQuoteSearch } from "./pages/PWAQuickQuotePage";
export { PWAAgendaPage } from "./pages/PWAAgendaPage";
export { PWANewVisitPage, type IPwaNewVisitSearch } from "./pages/PWANewVisitPage";
export { PWAProfilePage } from "./pages/PWAProfilePage";

export { usePwaAuth } from "./hooks/usePwaAuth";
export { readPwaSessionSync } from "./store/pwaAuthStore";
