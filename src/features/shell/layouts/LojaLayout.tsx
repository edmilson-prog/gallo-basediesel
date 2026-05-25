import { Outlet } from "@tanstack/react-router";
import { LojaHeader } from "@/features/shell/components/LojaHeader";
import { LojaFooter } from "@/features/shell/components/LojaFooter";

/**
 * Public storefront layout (`/loja/*`).
 * Header with categories/search/cart + content + institutional footer.
 */
export function LojaLayout({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <LojaHeader />
      <main className="flex-1">{children ?? <Outlet />}</main>
      <LojaFooter />
    </div>
  );
}
