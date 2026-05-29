import { Outlet } from "@tanstack/react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/features/shell/components/Sidebar";
import { TopBar } from "@/features/shell/components/TopBar";
import { BottomNav } from "@/features/shell/components/BottomNav";
import { useDistributionToasts } from "@/features/distribution/hooks/useDistributionToasts";
import { useAutoRevertTimer } from "@/features/carteira/hooks/useAutoRevertTimer";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";
import { useEscalationToasts, UrgentBroadcastClaim } from "@/features/sdr-escalation";
import { useEscalationQueueTimeoutMonitor } from "@/features/sdr-escalation/hooks/useEscalationQueueTimeoutMonitor";
import { useUrgentBroadcastTimer } from "@/features/sdr-escalation/hooks/useUrgentBroadcastTimer";
import { useQuoteExpirationTimer } from "@/features/quotes/hooks/useQuoteExpirationTimer";
import { useEcommerceSellerNotifier } from "@/features/ecommerce-integration";

/**
 * Default layout of the internal app (`/app/*`).
 * Sidebar (md+) + TopBar + scrollable content. BottomNav on mobile.
 */
export function AppLayout({ children }: { children?: React.ReactNode }) {
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
      <div className="flex h-screen overflow-hidden bg-background text-foreground">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          {/* TopBar lives inside the scroll container as a sticky header so
              content scrolls *behind* it — required for the glass effect. */}
          <main className="flex-1 overflow-y-auto pb-16 md:pb-0">
            <TopBar />
            {children ?? <Outlet />}
          </main>
        </div>
        <BottomNav />
        <UrgentBroadcastClaim />
      </div>
    </TooltipProvider>
  );
}
