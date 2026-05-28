import { useLocation } from "@tanstack/react-router";
import { PWABottomNav } from "./PWABottomNav";

/**
 * Mobile-first shell for the external-seller PWA (PRD-070 RF-001). Renders the
 * bottom navigation on authenticated screens; the login screen is chrome-free.
 */
export function PWALayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const isLogin = pathname.startsWith("/pwa/login");

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className={`mx-auto w-full max-w-md px-4 pt-4 ${isLogin ? "pb-8" : "pb-24"}`}>
        {children}
      </div>
      {!isLogin && <PWABottomNav />}
    </div>
  );
}
