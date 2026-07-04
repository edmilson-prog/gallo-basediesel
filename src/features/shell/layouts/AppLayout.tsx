import { Outlet } from "@tanstack/react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/features/shell/components/Sidebar";
import { TopBar } from "@/features/shell/components/TopBar";
import { BottomNav } from "@/features/shell/components/BottomNav";
import { AppFooter } from "@/features/shell/components/AppFooter";
import { DataSourceBanner } from "@/features/shell/components/DataSourceBanner";
import { DemoModeBanner } from "@/features/shell/components/DemoModeBanner";
import { WhatsAppDisconnectedBanner } from "@/features/shell/components/WhatsAppDisconnectedBanner";
import { OutsideHoursBanner } from "@/features/access";
import { WhatsNewModal } from "@/features/whats-new";
import { VersionUpdatePrompt } from "@/features/version-update";
import { useDistributionToasts } from "@/features/distribution/hooks/useDistributionToasts";
import { useAutoRevertTimer } from "@/features/carteira/hooks/useAutoRevertTimer";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { useEscalationToasts, UrgentBroadcastClaim } from "@/features/sdr-escalation";
import { useEscalationQueueTimeoutMonitor } from "@/features/sdr-escalation/hooks/useEscalationQueueTimeoutMonitor";
import { useUrgentBroadcastTimer } from "@/features/sdr-escalation/hooks/useUrgentBroadcastTimer";
import { useQuoteExpirationTimer } from "@/features/quotes/hooks/useQuoteExpirationTimer";
import { useEcommerceSellerNotifier } from "@/features/ecommerce-integration";
import { usePresenceTracker } from "@/features/shell/hooks/useStorePresence";
import { TourProvider } from "@/features/tour";
import { SessionTimeoutGuard } from "@/features/session-timeout";
import { AuthSessionGuard } from "@/features/auth/AuthSessionGuard";
import { InboxActivityGuard } from "@/features/inbox-alerts";

/**
 * Default layout of the internal app (`/app/*`).
 * Sidebar (md+) + TopBar + scrollable content. BottomNav on mobile.
 */
export function AppLayout({ children }: { children?: React.ReactNode }) {
  // Announces the signed-in seller as online via Supabase Realtime Presence
  // (no-op in mock auth mode). Consumed by the users screen (useStorePresence).
  usePresenceTracker();
  useDistributionToasts();
  useEscalationToasts();
  // Auto-revert global: Owner/Gestor com app aberto disparam expiração
  // automática de transferências temporárias vencidas. PRD-018 RF-030.
  const role = useCurrentRole();
  const canRunAutoRevert = role === "Owner" || role === "Gestor";
  useAutoRevertTimer(canRunAutoRevert);
  // PRD-023 — Owner/Gestor monitora timeouts de fila e dispara broadcast urgent.
  useEscalationQueueTimeoutMonitor(canRunAutoRevert);
  useUrgentBroadcastTimer(canRunAutoRevert);
  // PRD-031 — quote expiration timer (1h) for Owner/Gestor sessions.
  useQuoteExpirationTimer(canRunAutoRevert);
  // PRD-067 — toast the signed-in seller when a new e-commerce order arrives.
  useEcommerceSellerNotifier();
  return (
    <TooltipProvider delayDuration={200}>
      <TourProvider>
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Persistent mode context (demo data) above the transient
              data-origin failure banner. */}
          <DemoModeBanner />
          {/* Data-origin health banner — surfaces a break in the active data
              source (mock or Supabase) above everything else, then auto-hides. */}
          <DataSourceBanner />
          {/* TopBar lives inside the scroll container as a sticky header so
              content scrolls *behind* it — required for the glass effect. */}
          <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
            <TopBar />
            {/* Critical operational alert — sticky right under the TopBar
                (top-16) so it survives scrolling, unlike the banners above. */}
            <WhatsAppDisconnectedBanner />
            <OutsideHoursBanner />
            {children ?? <Outlet />}
          </main>
          {/* Status bar pinned to the bottom of the content column (desktop). */}
          <AppFooter />
        </div>
        <BottomNav />
        <AuthSessionGuard />
        <SessionTimeoutGuard />
        <InboxActivityGuard />
        <UrgentBroadcastClaim />
        <WhatsNewModal />
        <VersionUpdatePrompt />
      </div>
      </TourProvider>
    </TooltipProvider>
  );
}
