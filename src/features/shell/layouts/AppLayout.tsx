import { Outlet } from "@tanstack/react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Sidebar } from "@/features/shell/components/Sidebar";
import { TopBar } from "@/features/shell/components/TopBar";
import { BottomNav } from "@/features/shell/components/BottomNav";
import { useDistributionToasts } from "@/features/distribution/hooks/useDistributionToasts";
import { useAutoRevertTimer } from "@/features/carteira/hooks/useAutoRevertTimer";
import { useCurrentRole } from "@/features/rbac/hooks/useCurrentRole";

/**
 * Default layout of the internal app (`/app/*`).
 * Sidebar (md+) + TopBar + scrollable content. BottomNav on mobile.
 */
export function AppLayout({ children }: { children?: React.ReactNode }) {
  useDistributionToasts();
  // Auto-revert global: Owner/Gestor com app aberto disparam expiração
  // automática de transferências temporárias vencidas. PRD-018 RF-030.
  const role = useCurrentRole();
  const canRunAutoRevert = role === "Owner" || role === "Gestor";
  useAutoRevertTimer(canRunAutoRevert);
  return (
    <TooltipProvider delayDuration={200}>
      <div className="flex min-h-screen bg-background text-foreground">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <TopBar />
          <main className="flex-1 overflow-y-auto pb-16 md:pb-0">{children ?? <Outlet />}</main>
        </div>
        <BottomNav />
      </div>
    </TooltipProvider>
  );
}
