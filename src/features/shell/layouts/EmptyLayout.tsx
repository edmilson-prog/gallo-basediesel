import { Outlet } from "@tanstack/react-router";

/**
 * Minimal centered layout used by 404, /erro, /sem-permissao and splash screens.
 * Provides background and centers a single column without any chrome.
 */
export function EmptyLayout({ children }: { children?: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <main className="flex flex-1 items-center justify-center">{children ?? <Outlet />}</main>
    </div>
  );
}
