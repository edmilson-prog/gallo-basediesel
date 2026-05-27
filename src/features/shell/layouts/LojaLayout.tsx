import { Outlet } from "@tanstack/react-router";
import { StorefrontHeader } from "@/features/storefront/components/StorefrontHeader";
import { StorefrontFooter } from "@/features/storefront/components/StorefrontFooter";
import { useStorefrontSettings } from "@/features/storefront/hooks/useStorefrontSettings";
import { useStorefrontTheme } from "@/features/storefront/hooks/useStorefrontTheme";

/**
 * Public storefront layout (`/loja/*`) — PRD-060.
 *
 * Hosts the sticky `StorefrontHeader` (search, categories, brands, cart),
 * the routed page content, and the institutional `StorefrontFooter`. The
 * PARTS theme is applied while the layout is mounted and reverted on
 * unmount so the `/app` sub-app keeps its own identity.
 */
export function LojaLayout({ children }: { children?: React.ReactNode }) {
  useStorefrontTheme();
  const { config } = useStorefrontSettings();

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <StorefrontHeader brands={config.brands} />
      <main className="flex-1">{children ?? <Outlet />}</main>
      <StorefrontFooter footer={config.footer} />
    </div>
  );
}
