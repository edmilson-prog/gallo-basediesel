import { Outlet } from "@tanstack/react-router";
import { Sidebar } from "@/features/shell/components/Sidebar";
import { TopBar } from "@/features/shell/components/TopBar";
import { BottomNav } from "@/features/shell/components/BottomNav";

/**
 * Default layout of the internal app (`/app/*`).
 * Sidebar (md+) + TopBar + scrollable content. BottomNav on mobile.
 */
export function AppLayout({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="flex-1 overflow-y-auto pb-16 md:pb-0">{children ?? <Outlet />}</main>
      </div>
      <BottomNav />
    </div>
  );
}
