import { useLocation } from "@tanstack/react-router";
import { AppFooter } from "@/features/shell/components/AppFooter";
import { PWABottomNav } from "./PWABottomNav";

/**
 * Mobile-first shell for the external-seller PWA (PRD-070 RF-001). Renders the
 * bottom navigation on authenticated screens; the login screen is chrome-free.
 *
 * The version/branch footer is shown only on the login screen, where the
 * fixed bottom navigation is absent and there is room for a build stamp.
 */
export function PWALayout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation();
  const isLogin = pathname.startsWith("/pwa/login");

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <div className={`mx-auto w-full max-w-md flex-1 px-4 pt-4 ${isLogin ? "pb-8" : "pb-24"}`}>
        {children}
      </div>
      {isLogin && <AppFooter className="mx-auto flex w-full max-w-md" showWhatsNew={false} />}
      {!isLogin && <PWABottomNav />}
    </div>
  );
}
