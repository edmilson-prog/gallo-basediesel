import { Outlet } from "@tanstack/react-router";

/**
 * Full-height wrapper for /auth/*. The login route owns its own split-screen
 * composition (BrandPanel + form); simpler /auth pages (logout) just render
 * centered content inside `children`.
 */
export function AuthLayout({ children }: { children?: React.ReactNode }) {
  return <div className="min-h-screen bg-background text-foreground">{children ?? <Outlet />}</div>;
}
